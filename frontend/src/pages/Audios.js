// frontend/src/pages/Audios.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../lib/api';

const Audios = () => {
  const [audios, setAudios] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch audios from API
    const fetchAudios = async () => {
      try {
        const data = await apiGet('/api/audios/');
        setAudios(data);
      } catch (error) {
        console.error('Error fetching audios:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAudios();
  }, []);

  const handleCreateAudio = () => {
    window.alert('Inline audio create flow is next on the roadmap.');
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Audios</h2>
        <button 
          onClick={handleCreateAudio}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Create Audio
        </button>
      </div>
      
      {audios.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500">No audios found. Create your first audio.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  File Path
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Script
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Normalized
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {audios.map(audio => (
                <tr key={audio.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500 break-all">{audio.file_path}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{audio.script?.title || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{audio.duration ? `${audio.duration}s` : 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      audio.is_normalized ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {audio.is_normalized ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button 
                      onClick={() => navigate(`/audios/${audio.id}`)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      View
                    </button>
                    <button 
                      onClick={() => navigate(`/audios/${audio.id}/edit`)}
                      className="ml-4 text-yellow-600 hover:text-yellow-900"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => {
                        if (window.confirm('Are you sure you want to delete this audio?')) {
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

export default Audios;