// Point d'entrée principal de l'application
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import BonusesList from './pages/BonusesList';
import BonusForm from './pages/BonusForm';
import { useState } from 'react';

function App() {
  // État pour simuler l'utilisateur connecté (à remplacer par JWT plus tard)
  const [currentUser, setCurrentUser] = useState({
    id: 1,
    name: 'Vonjy Rakotoniaina',
    poste: 'Chef de Projet',
    is_validator_n1: true,
  });

  return (
    <BrowserRouter>
      {/* Barre de navigation */}
      <Navbar />
      
      {/* Contenu principal */}
      <main className="min-h-screen bg-base-200">
        <Routes>
          {/* Route Dashboard */}
          <Route path="/" element={<Dashboard />} />
          
          {/* Route Liste des primes */}
          <Route 
            path="/bonuses" 
            element={<BonusesList currentUser={currentUser} />} 
          />
          
          {/* Route Nouvelle prime */}
          <Route 
            path="/bonuses/new" 
            element={<BonusForm />} 
          />
          
          {/* Route Employés (à compléter) */}
          <Route 
            path="/employees" 
            element={
              <div className="container mx-auto px-4 py-8">
                <h1 className="text-3xl font-bold">Employés</h1>
                <p className="mt-4">Liste des employés à venir...</p>
              </div>
            } 
          />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;
