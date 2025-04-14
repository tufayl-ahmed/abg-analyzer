import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons';

function Header() {
  return (
    <header className="app-header">
      <a
        href="https://www.thoracic.org/professionals/clinical-resources/critical-care/clinical-education/abgs.php"
        target="_blank"
        rel="noopener noreferrer" // Added for security
        className="ats-link"
        title="ATS ABG Guidelines"
      >
        <FontAwesomeIcon icon={faExternalLinkAlt} /> ATS Guidelines
      </a>
      <h1>ABG Analyzer</h1>
      <p>Using American Thoracic Society (ATS) Six-Step Integration</p>
    </header>
  );
}

export default Header;
