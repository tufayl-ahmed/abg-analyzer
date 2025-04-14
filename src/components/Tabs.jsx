import React from 'react';

function Tabs({ activeTab, onTabChange }) {
  return (
    <div className="tabs">
      <button
        className={`tab-btn ${activeTab === 'manual' ? 'active' : ''}`}
        onClick={() => onTabChange('manual')}
        data-tab="manual" // Keep data-tab for potential CSS targeting
      >
        Manual Entry
      </button>
      <button
        className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
        onClick={() => onTabChange('upload')}
        data-tab="upload"
      >
        Upload Image/PDF
      </button>
    </div>
  );
}

export default Tabs;
