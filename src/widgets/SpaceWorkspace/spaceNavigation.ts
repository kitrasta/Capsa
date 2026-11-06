export interface SpaceNavigationState {
    parentSpaceId?: string;
    spaceAncestry?: string[];
}

export const spaceNavigationState = (ancestry: string[]): SpaceNavigationState => ({
    spaceAncestry: ancestry,
    parentSpaceId: ancestry.at(-1),
});

export const readSpaceAncestry = (value: unknown, currentSpaceId: string): string[] => {
    const state = value as SpaceNavigationState | null;
    const stored = Array.isArray(state?.spaceAncestry)
        ? state.spaceAncestry.filter((spaceId): spaceId is string => (
            typeof spaceId === 'string' && spaceId.length > 0
        ))
        : typeof state?.parentSpaceId === 'string'
          ? [state.parentSpaceId]
          : [];
    return stored.filter((spaceId, index) => (
        spaceId !== currentSpaceId && stored.lastIndexOf(spaceId) === index
    ));
};

export const childSpaceNavigationState = (
    value: unknown,
    currentSpaceId: string,
    targetSpaceId: string,
): SpaceNavigationState => {
    const ancestry = readSpaceAncestry(value, currentSpaceId);
    const existingTarget = ancestry.indexOf(targetSpaceId);
    return spaceNavigationState(existingTarget >= 0
        ? ancestry.slice(0, existingTarget)
        : [...ancestry, currentSpaceId]);
};

export const parentSpaceNavigationState = (
    value: unknown,
    currentSpaceId: string,
): SpaceNavigationState => {
    const ancestry = readSpaceAncestry(value, currentSpaceId);
    return spaceNavigationState(ancestry.slice(0, -1));
};
