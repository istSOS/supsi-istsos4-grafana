# Copyright 2026 SUPSI
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
import os
import time
from urllib.parse import quote, urlparse

import requests
from selenium import webdriver
from selenium.common.exceptions import NoSuchElementException, TimeoutException
from selenium.webdriver import Firefox
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

GRAFANA_URL = os.environ.get("GRAFANA_URL")
GRAFANA_USER = os.environ.get("GRAFANA_USER")
GRAFANA_PASS = os.environ.get("GRAFANA_PASS")
GRAFANA_TOKEN = os.environ.get("GRAFANA_TOKEN")

SELENIUM_TIMEOUT = int(os.getenv("SELENIUM_TIMEOUT", "30"))
DASHBOARD_READY_TIMEOUT = int(os.getenv("DASHBOARD_READY_TIMEOUT", "15"))
DASHBOARD_INITIAL_WAIT = float(os.getenv("DASHBOARD_INITIAL_WAIT", "3"))
DASHBOARD_SETTLE_SECONDS = float(os.getenv("DASHBOARD_SETTLE_SECONDS", "5"))
DASHBOARD_EXTRA_WAIT = float(os.getenv("DASHBOARD_EXTRA_WAIT", "10"))
GECKODRIVER_PATH = os.getenv("GECKODRIVER_PATH", "/usr/local/bin/geckodriver")


def api_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "Authorization": f"Bearer {GRAFANA_TOKEN}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
    )
    return session


def encode_snapshot_key(snapshot_key: str) -> str:
    return quote(snapshot_key, safe="")


def get_snapshot_payload(session: requests.Session, snapshot_key: str) -> dict:
    encoded_key = encode_snapshot_key(snapshot_key)
    response = session.get(
        f"{GRAFANA_URL}/api/snapshots/{encoded_key}",
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def delete_snapshot_if_exists(session: requests.Session, snapshot_key: str):
    encoded_key = encode_snapshot_key(snapshot_key)

    response = session.get(
        f"{GRAFANA_URL}/api/snapshots/{encoded_key}",
        timeout=30,
    )
    if response.status_code == 404:
        return

    response.raise_for_status()

    delete_response = session.delete(
        f"{GRAFANA_URL}/api/snapshots/{encoded_key}",
        timeout=30,
    )
    delete_response.raise_for_status()
    print(f"Deleted snapshot {snapshot_key}", flush=True)


def create_snapshot_from_existing_payload(
    session: requests.Session,
    snapshot_data: dict,
    dashboard_title: str,
) -> dict:
    body = {
        "dashboard": snapshot_data["dashboard"],
        "name": dashboard_title,
        "key": dashboard_title,
        "deleteKey": f"{dashboard_title}__delete",
    }

    response = session.post(
        f"{GRAFANA_URL}/api/snapshots",
        json=body,
        timeout=30,
    )

    if not response.ok:
        raise RuntimeError(
            f"POST /api/snapshots failed with {response.status_code}: {response.text}"
        )

    return response.json()


# =========================
# Selenium helpers
# =========================


def wait_present(driver, by, selector, timeout=SELENIUM_TIMEOUT):
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((by, selector))
    )


def wait_visible(driver, by, selector, timeout=SELENIUM_TIMEOUT):
    return WebDriverWait(driver, timeout).until(
        EC.visibility_of_element_located((by, selector))
    )


def safe_click(driver, by, selector, timeout=SELENIUM_TIMEOUT):
    element = WebDriverWait(driver, timeout).until(
        EC.element_to_be_clickable((by, selector))
    )
    driver.execute_script(
        "arguments[0].scrollIntoView({block: 'center'});", element
    )
    driver.execute_script("arguments[0].click();", element)
    return element


def element_exists(driver, by, selector):
    try:
        driver.find_element(by, selector)
        return True
    except NoSuchElementException:
        return False


def first_present(driver, selectors, timeout=SELENIUM_TIMEOUT):
    last_exc = None
    for by, selector in selectors:
        try:
            return wait_present(driver, by, selector, timeout)
        except Exception as exc:
            last_exc = exc
    raise last_exc


def maybe_fail_on_broken_frontend(driver):
    body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
    if "grafana has failed to load its application files" in body_text:
        raise RuntimeError(
            "Grafana frontend assets failed to load. Check root_url, "
            "serve_from_sub_path, and nginx proxy configuration."
        )


def build_driver() -> Firefox:
    options = Options()
    options.add_argument("--headless")
    service = Service(GECKODRIVER_PATH)
    driver = webdriver.Firefox(service=service, options=options)
    driver.set_window_size(1600, 1200)
    return driver


def login_if_needed(driver: WebDriver):
    wait_present(driver, By.TAG_NAME, "body")
    maybe_fail_on_broken_frontend(driver)

    if element_exists(driver, By.NAME, "user") and element_exists(
        driver, By.NAME, "password"
    ):
        user_input = wait_visible(driver, By.NAME, "user")
        pass_input = wait_visible(driver, By.NAME, "password")

        user_input.clear()
        user_input.send_keys(GRAFANA_USER)
        pass_input.clear()
        pass_input.send_keys(GRAFANA_PASS)

        if element_exists(driver, By.CSS_SELECTOR, 'button[type="submit"]'):
            safe_click(driver, By.CSS_SELECTOR, 'button[type="submit"]')
        else:
            pass_input.submit()

        wait_present(driver, By.TAG_NAME, "body")
        maybe_fail_on_broken_frontend(driver)


# =========================
# Dashboard loading
# =========================


def grafana_origin_and_base_path():
    parsed = urlparse(GRAFANA_URL)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    base_path = parsed.path.rstrip("/")
    return origin, base_path


def make_absolute_dashboard_url(relative_or_absolute_url: str) -> str:
    if relative_or_absolute_url.startswith(("http://", "https://")):
        return relative_or_absolute_url

    origin, base_path = grafana_origin_and_base_path()
    rel = relative_or_absolute_url.strip()

    if base_path:
        if rel == base_path or rel.startswith(base_path + "/"):
            return f"{origin}{rel}"
        return f"{origin}{base_path}{rel}"

    return f"{origin}{rel}"


def wait_document_ready(driver, timeout=DASHBOARD_READY_TIMEOUT):
    WebDriverWait(driver, timeout).until(
        lambda d: d.execute_script("return document.readyState") == "complete"
    )


def get_loading_state(driver):
    return driver.execute_script(
        """
        function isVisible(el) {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && rect.width > 0
                && rect.height > 0;
        }

        const loadingSelectors = [
            '[aria-label*="Loading"]',
            '[aria-label*="loading"]',
            '[data-testid*="loading"]',
            '[data-testid*="spinner"]',
            '.panel-loading',
            '.dashboard-loading',
            '.loading-spinner',
            '.preloader'
        ];

        const panelSelectors = [
            '[data-panelid]',
            '.panel-container',
            '[data-testid*="panel header"]',
            '[data-testid*="panel-content"]',
            '[class*="panel-container"]',
            '[class*="panelContent"]',
            '[class*="panelWrapper"]'
        ];

        let visibleLoaders = 0;
        for (const selector of loadingSelectors) {
            document.querySelectorAll(selector).forEach((el) => {
                if (isVisible(el)) {
                    visibleLoaders += 1;
                }
            });
        }

        let panelCount = 0;
        for (const selector of panelSelectors) {
            panelCount += document.querySelectorAll(selector).length;
        }

        const shareButtonSelectors = [
            '[aria-label="Toggle share menu"]',
            '[data-testid*="new share button arrow menu"]'
        ];

        let shareButtonFound = false;
        for (const selector of shareButtonSelectors) {
            const el = document.querySelector(selector);
            if (el && isVisible(el)) {
                shareButtonFound = true;
                break;
            }
        }

        return {
            readyState: document.readyState,
            visibleLoaders,
            panelCount,
            shareButtonFound,
            bodyText: document.body ? document.body.innerText.slice(0, 500) : ''
        };
        """
    )


def wait_dashboard_ready(
    driver,
    timeout=DASHBOARD_READY_TIMEOUT,
    settle_seconds=DASHBOARD_SETTLE_SECONDS,
    poll_interval=0.5,
):
    wait_document_ready(driver, timeout=timeout)
    maybe_fail_on_broken_frontend(driver)

    time.sleep(DASHBOARD_INITIAL_WAIT)

    end_time = time.time() + timeout
    stable_since = None
    fallback_since = None
    last_state = None

    while time.time() < end_time:
        state = get_loading_state(driver)
        last_state = state

        # Normal path: panels detected and no visible loaders
        if state["panelCount"] > 0 and state["visibleLoaders"] == 0:
            if stable_since is None:
                stable_since = time.time()

            if time.time() - stable_since >= settle_seconds:
                if DASHBOARD_EXTRA_WAIT > 0:
                    time.sleep(DASHBOARD_EXTRA_WAIT)
                return

        else:
            stable_since = None

        # Fallback path:
        # document complete + no loaders + share button present,
        # even if panel selectors did not match this Grafana DOM
        if (
            state["readyState"] == "complete"
            and state["visibleLoaders"] == 0
            and state["shareButtonFound"]
        ):
            if fallback_since is None:
                fallback_since = time.time()

            if time.time() - fallback_since >= settle_seconds:
                if DASHBOARD_EXTRA_WAIT > 0:
                    time.sleep(DASHBOARD_EXTRA_WAIT)
                return
        else:
            fallback_since = None

        time.sleep(poll_interval)

    raise RuntimeError(
        "Dashboard did not finish loading before timeout. "
        f"Last state: {last_state}"
    )


def open_dashboard(driver, dashboard_url: str, dashboard_title: str):
    url = make_absolute_dashboard_url(dashboard_url)
    driver.get(url)
    wait_present(driver, By.TAG_NAME, "body")
    maybe_fail_on_broken_frontend(driver)
    wait_dashboard_ready(driver)


# =========================
# Snapshot via Selenium
# =========================


def install_clipboard_hook(driver):
    driver.execute_script(
        """
        window.__snapshotCopiedUrl = null;

        if (!window.__snapshotClipboardHookInstalled) {
            window.__snapshotClipboardHookInstalled = true;

            const originalClipboard = navigator.clipboard;
            if (originalClipboard && originalClipboard.writeText) {
                const originalWriteText = originalClipboard.writeText.bind(originalClipboard);

                navigator.clipboard.writeText = function(text) {
                    window.__snapshotCopiedUrl = text;
                    return originalWriteText(text);
                };
            }
        }
        """
    )


def wait_copied_url(driver, timeout=10):
    end_time = time.time() + timeout

    while time.time() < end_time:
        copied = driver.execute_script(
            "return window.__snapshotCopiedUrl || null;"
        )
        if copied:
            return copied.strip()
        time.sleep(0.2)

    raise RuntimeError(
        "Copy URL button clicked, but no copied URL was captured"
    )


def publish_snapshot_with_selenium(driver):
    time.sleep(1)

    arrow_menu = first_present(
        driver,
        [
            (By.CSS_SELECTOR, '[aria-label="Toggle share menu"]'),
            (By.CSS_SELECTOR, '[data-testid*="new share button arrow menu"]'),
            (By.XPATH, '//*[@aria-label="Toggle share menu"]'),
            (
                By.XPATH,
                '//*[contains(@data-testid, "new share button arrow menu")]',
            ),
        ],
        timeout=15,
    )
    driver.execute_script(
        "arguments[0].scrollIntoView({block: 'center'});", arrow_menu
    )
    ActionChains(driver).move_to_element(arrow_menu).click().perform()
    time.sleep(1)

    snapshot_entry = first_present(
        driver,
        [
            (
                By.CSS_SELECTOR,
                '[data-testid*="new share button share snapshot"]',
            ),
            (
                By.XPATH,
                '//*[contains(@data-testid, "new share button share snapshot")]',
            ),
            (
                By.XPATH,
                '//*[@role="menuitem" and contains(normalize-space(), "Snapshot")]',
            ),
            (By.XPATH, '//*[contains(normalize-space(), "Share snapshot")]'),
        ],
        timeout=10,
    )
    driver.execute_script(
        "arguments[0].scrollIntoView({block: 'center'});", snapshot_entry
    )
    driver.execute_script("arguments[0].click();", snapshot_entry)
    time.sleep(2)

    publish_button = first_present(
        driver,
        [
            (
                By.CSS_SELECTOR,
                '[data-testid*="share snapshot publish button"]',
            ),
            (
                By.XPATH,
                '//*[contains(@data-testid, "share snapshot publish button")]',
            ),
            (
                By.XPATH,
                '//button[contains(normalize-space(), "Publish snapshot")]',
            ),
            (
                By.XPATH,
                '//button[contains(normalize-space(), "Publish to snapshot")]',
            ),
        ],
        timeout=20,
    )
    driver.execute_script(
        "arguments[0].scrollIntoView({block: 'center'});", publish_button
    )
    driver.execute_script("arguments[0].click();", publish_button)

    install_clipboard_hook(driver)

    copy_url_button = first_present(
        driver,
        [
            (
                By.CSS_SELECTOR,
                '[data-testid*="share snapshot copy url button"]',
            ),
            (
                By.XPATH,
                '//*[contains(@data-testid, "share snapshot copy url button")]',
            ),
            (
                By.XPATH,
                '//button[contains(normalize-space(), "Copy URL")]',
            ),
        ],
        timeout=30,
    )
    driver.execute_script(
        "arguments[0].scrollIntoView({block: 'center'});", copy_url_button
    )
    driver.execute_script("arguments[0].click();", copy_url_button)

    snapshot = wait_copied_url(driver, timeout=10)
    return snapshot


def extract_snapshot_key(snapshot_url: str) -> str:
    path = urlparse(snapshot_url).path.rstrip("/")
    return path.split("/")[-1]


# =========================
# Main
# =========================


def main():
    session = api_session()
    driver = build_driver()

    try:
        driver.get(GRAFANA_URL)
        login_if_needed(driver)

        response = session.get(
            f"{GRAFANA_URL}/api/search",
            timeout=30,
            params={"type": "dash-db"},
        )
        response.raise_for_status()
        dashboards = response.json()

        print(f"Found {len(dashboards)} dashboards", flush=True)

        for d in dashboards:
            print("########################################", flush=True)

            title = d["title"]
            print(f"Processing dashboard: {title}", flush=True)

            response = session.get(
                f"{GRAFANA_URL}/api/dashboards/uid/{d['uid']}",
                timeout=30,
            )
            response.raise_for_status()
            dashboard = response.json()
            from_time = dashboard["dashboard"]["time"]["from"]
            to_time = dashboard["dashboard"]["time"]["to"]
            timezone = dashboard["dashboard"]["timezone"]

            templating = dashboard["dashboard"]["templating"]["list"]
            params = []
            for var in templating:
                name = var["name"]
                current = var.get("current", {})
                values = current.get("value")

                if values is None:
                    continue

                if not isinstance(values, list):
                    values = [values]

                for v in values:
                    params.append(f"var-{name}={v}")

            base_url = (
                d["url"]
                + f"?orgId=1&from={from_time}&to={to_time}&timezone={timezone}"
            )

            if params:
                dashboard_url = base_url + "&" + "&".join(params)
            else:
                dashboard_url = base_url

            open_dashboard(driver, dashboard_url, title)

            selenium_snapshot_url = publish_snapshot_with_selenium(driver)
            selenium_snapshot_key = extract_snapshot_key(selenium_snapshot_url)

            print(
                f"Created snapshot {selenium_snapshot_key}",
                flush=True,
            )

            snapshot_data_selenium = get_snapshot_payload(
                session, selenium_snapshot_key
            )

            delete_snapshot_if_exists(session, title)

            create_snapshot_from_existing_payload(
                session=session,
                snapshot_data=snapshot_data_selenium,
                dashboard_title=title,
            )

            print(
                f"Created snapshot '{title}' from snapshot {selenium_snapshot_key}",
                flush=True,
            )

            delete_snapshot_if_exists(session, selenium_snapshot_key)

    except TimeoutException as exc:
        current_url = driver.current_url
        try:
            body_preview = driver.find_element(By.TAG_NAME, "body").text[:2000]
        except NoSuchElementException:
            body_preview = "<body not available>"

        raise RuntimeError(
            f"Timed out waiting for Grafana UI element.\n"
            f"URL: {current_url}\n"
            f"Body preview: {body_preview}\n"
            f"Original error: {exc}"
        ) from exc
    finally:
        driver.quit()
        session.close()


if __name__ == "__main__":
    main()
