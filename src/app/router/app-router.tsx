import {Route, Routes, Navigate} from 'react-router-dom'
import LoginPage from '../../pages/LoginPage.tsx'

const AppRouter = () => {
return (
    <Routes>
        <Route path='/' element={<Navigate to='/auth' replace />} />
        <Route path='*' element={<Navigate to='/auth' replace />} />

        <Route path="/auth" element={<LoginPage />} />
    </Routes>


)
}

export default AppRouter