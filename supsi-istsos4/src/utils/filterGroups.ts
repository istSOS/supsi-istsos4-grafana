import { FilterCondition, FilterGroup } from '../types';

export function normalizeFilterGroup(filters: FilterCondition[], group?: FilterGroup): FilterGroup {
  const remaining = new Set(filters.map((filter) => filter.id));
  const visit = (node: FilterGroup): FilterGroup => ({
    ...node,
    filterIds: node.filterIds.filter((id) => {
      if (!remaining.has(id)) {
        return false;
      }
      remaining.delete(id);
      return true;
    }),
    groups: node.groups.map(visit),
  });
  const root = visit(group || { id: 'root', combinator: 'and', filterIds: [], groups: [] });
  return { ...root, filterIds: [...root.filterIds, ...remaining] };
}

export function updateFilterGroup(
  root: FilterGroup,
  id: string,
  update: (group: FilterGroup) => FilterGroup
): FilterGroup {
  return root.id === id
    ? update(root)
    : { ...root, groups: root.groups.map((group) => updateFilterGroup(group, id, update)) };
}

export function groupFilterIds(group: FilterGroup): string[] {
  return [...group.filterIds, ...group.groups.flatMap(groupFilterIds)];
}
