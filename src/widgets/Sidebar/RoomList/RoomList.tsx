import styles from './RoomList.module.css'
import {useState, useEffect} from 'react'


const RoomList = () => {

    const [myRooms, setMyRooms] = useState<Room[]>([]);

            useEffect(() => {
        const loadRooms = async () => {
            const rooms = await getMyRooms();
            setMyRooms(rooms);
        };
        loadRooms();
    }, []);

        const handleRoomClick = async (roomId: string) => {
        try {
            await joinRoom(roomId);
            const rooms = await getMyRooms();
            setMyRooms(rooms);
        } catch (error) {
            console.error('че то сломалось:', error)
        }

    }

    return (
        <>
    
          {pathname === '/chats' && (
                <div className={styles.rooms}>
                    {myRooms.map((room) => (
                        <div className={styles.room} key={room.roomId}>
                            {room.name}
                        </div>
                    ))}
                </div>

        </>
    )
}

export default RoomList