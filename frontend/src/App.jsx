import { Routes, Route, Navigate } from 'react-router-dom';
import Rojmel from './pages/Rojmel';
import Khata  from './pages/Khata';
import Pagar  from './pages/Pagar';

export default function App() {
  return (
    <Routes>
      <Route path="/"       element={<Navigate to="/rojmel" replace />} />
      <Route path="/rojmel" element={<Rojmel />} />
      <Route path="/khata"  element={<Khata />} />
      <Route path="/pagar"  element={<Pagar />} />
    </Routes>
  );
}
