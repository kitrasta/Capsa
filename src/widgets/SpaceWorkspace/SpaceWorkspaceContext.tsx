import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useSpaceWorkspace } from './useSpaceWorkspace';
import type { SpaceWorkspaceModel } from './useSpaceWorkspace';

const SpaceWorkspaceContext = createContext<SpaceWorkspaceModel | null>(null);

export const SpaceWorkspaceProvider = ({
    spaceId,
    children,
}: {
    spaceId: string;
    children: ReactNode;
}) => {
    const model = useSpaceWorkspace(spaceId);
    return <SpaceWorkspaceContext.Provider value={model}>{children}</SpaceWorkspaceContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSpaceWorkspaceContext = (): SpaceWorkspaceModel => {
    const model = useContext(SpaceWorkspaceContext);
    if (!model) {
        throw new Error('useSpaceWorkspaceContext must be used within SpaceWorkspaceProvider');
    }
    return model;
};
