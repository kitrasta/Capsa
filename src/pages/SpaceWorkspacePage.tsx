import { useLocation, useParams } from 'react-router-dom';
import { RoomAccessGate } from '../widgets/Chat';
import SpaceOverview from '../widgets/SpaceWorkspace/SpaceOverview';
import { useSpaceWorkspaceContext } from '../widgets/SpaceWorkspace/SpaceWorkspaceContext';

const SpaceWorkspacePage = () => {
    const { spaceId = '', roomId } = useParams();
    const location = useLocation();
    const { unavailable } = useSpaceWorkspaceContext();

    if (!roomId || unavailable) return <SpaceOverview />;

    return (
        <RoomAccessGate
            key={roomId}
            roomId={roomId}
            backTo={`/spaces/${encodeURIComponent(spaceId)}`}
            backState={location.state}
        />
    );
};

export default SpaceWorkspacePage;
