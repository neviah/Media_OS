// frontend/src/pages/AvatarDetail.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiDelete, apiGet } from '../lib/api';

const AvatarDetail = () => {
  const { id } = useParams();
  const [avatar, setAvatar] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAvatar = async () => {
      try {
        const data = await apiGet(`/api/avatars/${id}`);
          setAvatar(data);
      } catch (error) {
        console.error('Error fetching avatar:', error);
        navigate('/avatars');
      } finally {
        setLoading(false);
      }
    };

    fetchAvatar();
  }, [id, navigate]);

  if (loading) return <div className="text-center py-10">Loading...</div>;
  if (!avatar) return <div className="text-center py-10">Avatar not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Avatar Details</h2>
        <div className="flex space-x-3">
          <button 
            onClick={() => window.alert('Inline avatar edit flow is next on the roadmap.')}
            className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded"
          >
            Edit
          </button>
          <button 
            onClick={async () => {
              if (!window.confirm('Are you sure you want to delete this avatar?')) {
                return;
              }
              try {
                await apiDelete(`/api/avatars/${id}`);
                navigate('/avatars');
              } catch {
                window.alert('Failed to delete avatar.');
              }
            }}
            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
          >
            Delete
          </button>
          <button 
            onClick={() => navigate('/avatars')}
            className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
          >
            Back to List
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold">Basic Information</h3>
            <p className="text-gray-600"><strong>Name:</strong> {avatar.name}</p>
            <p className="text-gray-600"><strong>Style Hints:</strong> {avatar.style_hints || 'N/A'}</p>
            <p className="text-gray-600"><strong>Channel Type:</strong> {avatar.channel_type || 'N/A'}</p>
            <p className="text-gray-600"><strong>Voice Profile ID:</strong> {avatar.voice_profile_id || 'N/A'}</p>
          </div>
          
          <div>
            <h3 className="font-semibold">Images</h3>
            {avatar.base_portrait_path ? (
              <div>
                <p className="text-gray-600"><strong>Base Portrait:</strong></p>
                <img 
                  src={avatar.base_portrait_path} 
                  alt="Base portrait" 
                  className="max-w-xs rounded border"
                />
              </div>
            ) : (
              <p className="text-gray-500">No base portrait</p>
            )}
            {avatar.reference_sheet_path ? (
              <div>
                <p className="text-gray-600"><strong>Reference Sheet:</strong></p>
                <img 
                  src={avatar.reference_sheet_path} 
                  alt="Reference sheet" 
                  className="max-w-xs rounded border"
                />
              </div>
            ) : (
              <p className="text-gray-500">No reference sheet</p>
            )}
          </div>
        </div>
        
        <div>
          <h3 className="font-semibold">Metadata</h3>
          <p className="text-gray-600"><strong>Created At:</strong> {new Date(avatar.created_at).toLocaleString()}</p>
          <p className="text-gray-600"><strong>Updated At:</strong> {new Date(avatar.updated_at).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
};

export default AvatarDetail;