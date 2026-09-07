import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Navbar = () => {
  const { user, logout } = useAuth();

  return (
    <div className="navbar bg-primary text-primary-content">
      <div className="flex-1">
        <Link to="/" className="btn btn-ghost text-xl">BPM Primes Blueline</Link>
      </div>
      <div className="flex-none gap-2">
        <ul className="menu menu-horizontal p-0">
          <li><Link to="/dashboard">Dashboard</Link></li>
          <li><Link to="/employees">Employés</Link></li>
          <li><Link to="/bonuses">Primes</Link></li>
        </ul>
        {user ? (
          <div className="dropdown dropdown-end">
            <label tabIndex={0} className="btn btn-ghost btn-circle avatar placeholder">
              <div className="bg-neutral-focus text-neutral-content rounded-full w-8">
                <span>{user.name.charAt(0).toUpperCase()}</span>
              </div>
            </label>
            <ul tabIndex={0} className="mt-3 p-2 shadow menu menu-compact dropdown-content bg-base-100 rounded-box w-52 text-base-content">
              <li className="p-2 text-sm opacity-70">{user.email}</li>
              <li><button onClick={logout}>Déconnexion</button></li>
            </ul>
          </div>
        ) : (
          <Link to="/login" className="btn btn-ghost">Connexion</Link>
        )}
      </div>
    </div>
  );
};

export default Navbar;
