// Composant Navbar avec Daisy UI
const Navbar = () => {
  return (
    <div className="navbar bg-primary text-primary-content">
      {/* Logo / Titre */}
      <div className="flex-1">
        <a className="btn btn-ghost text-xl">BPM Primes Blueline</a>
      </div>
      
      {/* Liens de navigation */}
      <div className="flex-none">
        <ul className="menu menu-horizontal p-0">
          <li><a href="/">Dashboard</a></li>
          <li><a href="/employees">Employés</a></li>
          <li><a href="/bonuses">Primes</a></li>
          <li><a href="/validations">Validations</a></li>
        </ul>
      </div>
    </div>
  );
};

export default Navbar;
