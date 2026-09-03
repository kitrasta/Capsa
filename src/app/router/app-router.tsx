import { Route, Routes, Navigate } from 'react-router-dom'
import LoginPage from '../../pages/LoginPage.tsx'
import AuthLayout from '../ui/AuthLayout.tsx'
import MainLayout from '../ui/MainLayout.tsx'
import ChatsPage from '../../pages/ChatsPage.tsx'
import  AuthGuard  from './AuthGuard.tsx'

const AppRouter = () => {
    return (
        <Routes>
            <Route element={<AuthLayout />}>
                <Route path="/auth" element={<LoginPage />} />

            </Route>
            <Route element={<AuthGuard />}>
                <Route element={<MainLayout />}>
                    <Route path="/chats" element={<ChatsPage />} />
                </Route>
            </Route>


            <Route path="*" element={<Navigate to="/auth" />} />
            <Route path="/" element={<Navigate to="/auth" />} />
        </Routes>
    )
}


export default AppRouter