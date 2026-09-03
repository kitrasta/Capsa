import {Route, Routes, Navigate} from 'react-router-dom'
import LoginPage from '../../pages/LoginPage.tsx'
import AuthLayout from '../ui/AuthLayout.tsx'
import MainLayout from '../ui/MainLayout.tsx'
import ChatsPage from '../../pages/ChatsPage.tsx'

const AppRouter = () => {
return (
    <Routes>
        <Route element={<AuthLayout />}>
            <Route path='/' element={<Navigate to='/auth' replace />} />
            <Route path='*' element={<Navigate to='/auth' replace />} />

        <Route path="/auth" element={<LoginPage />} />

        <Route element={<MainLayout />}>
        <Route path="/chats" element={<ChatsPage />} />

        </Route>


    </Routes>


)
}

export default AppRouter