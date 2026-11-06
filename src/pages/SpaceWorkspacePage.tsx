import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { RoomAccessGate } from '../widgets/Chat';
import SpaceOverview from '../widgets/SpaceWorkspace/SpaceOverview';
import styles from '../widgets/SpaceWorkspace/SpaceWorkspace.module.css';

const SpaceWorkspacePage = () => {
    const { spaceId = '', roomId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();

    if (!roomId) return <SpaceOverview />;

    return (
        <div className={styles.roomPanel}>
            <button
                className={styles.mobileRoomBack}
                type="button"
                onClick={() => navigate(`/spaces/${encodeURIComponent(spaceId)}`, {
                    state: location.state,
                })}
            >
                <ArrowLeft size={20} />
                Назад к обзору пространства
            </button>
            <RoomAccessGate key={roomId} roomId={roomId} />
        </div>
    );
};

export default SpaceWorkspacePage;
