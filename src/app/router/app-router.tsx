import {Route, Routes} from 'react-router-dom'
import LoginPage from '../../pages/LoginPage.tsx'

const AppRouter = () => {
return (
    <Routes>
        <Route path="auth" element={<LoginPage />} />
    </Routes>
)
}

export default AppRouter