// frontend/src/pages/Scripts.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../lib/api';

const Scripts = () => {
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch scripts from API
    const fetchScripts = async () => {
      try {
        const data = await apiGet('/api/scripts/');
        setScripts(data);
      } catch (error) {
        console.error('Error fetching scripts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchScripts();
  }, []);

  const handleCreateScript = () => {
    window.alert('Inline script create flow is next on the roadmap.');
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Scripts</h2>
        <button 
          onClick={handleCreateScript}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Create Script
        </button>
      </div>
      
      {scripts.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500">No scripts found. Create your first script.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Channel
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Summary
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Validated
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {scripts.map(script => (
                <tr key={script.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{script.title}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{script.channel?.name || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{script.summary ? script.summary.substring(0, 50) + '...' : 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      script.is_validated ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {script.is_validated ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button 
                      onClick={() => navigate(`/scripts/${script.id}`)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      View
                    </button>
                    <button 
                      onClick={() => navigate(`/scripts/${script.id}/edit`)}
                      className="ml-4 text-yellow-600 hover:text-yellow-900"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => {
                        if (window.confirm('Are you sure you want to delete this script?')) {
                          // TODO: Implement delete
                        }
                      }}
                      className="ml-4 text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Scripts;