// frontend/src/pages/PublishLogs.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../lib/api';

const PublishLogs = () => {
  const [publishLogs, setPublishLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch publish logs from API
    const fetchPublishLogs = async () => {
      try {
        const data = await apiGet('/api/publish-logs/');
        setPublishLogs(data);
      } catch (error) {
        console.error('Error fetching publish logs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPublishLogs();
  }, []);

  const handleCreatePublishLog = () => {
    window.alert('Inline publish-log create flow is next on the roadmap.');
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Publish Logs</h2>
        <button 
          onClick={handleCreatePublishLog}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Create Publish Log
        </button>
      </div>
      
      {publishLogs.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500">No publish logs found. Create your first publish log.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Platform
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Video
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Post URL
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Published At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {publishLogs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{log.platform}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{log.video?.title || 'Video #' + log.video_id}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500 break-all">{log.post_url || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      log.status === 'success' ? 'bg-green-100 text-green-800' : 
                      log.status === 'failed' ? 'bg-red-100 text-red-800' : 
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {log.published_at ? new Date(log.published_at).toLocaleString() : 'Not published'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button 
                      onClick={() => navigate(`/publish-logs/${log.id}`)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      View
                    </button>
                    <button 
                      onClick={() => navigate(`/publish-logs/${log.id}/edit`)}
                      className="ml-4 text-yellow-600 hover:text-yellow-900"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => {
                        if (window.confirm('Are you sure you want to delete this publish log?')) {
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

export default PublishLogs;