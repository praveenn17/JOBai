import React, { useEffect, useState, useRef } from 'react';
import { Upload, FileText, Trash2, CheckCircle, Download, Eye } from 'lucide-react';
import api, { uploadFile, downloadFile } from '../services/api';
import { ENDPOINTS, buildUrl } from '../services/endpoints';
import { Card, Btn, SectionTitle, Badge, Empty } from '../components/UI';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/Confirm';
import Loader from '../components/Loader';

export default function ResumeManager() {
  const [resumes, setResumes]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [preview, setPreview]   = useState(null);
  const fileRef = useRef();
  const toast   = useToast();
  const confirm = useConfirm();

  const load = () => {
    setLoading(true);
    api.get(ENDPOINTS.resume.list)
      .then(r => setResumes(r.data.resumes || []))
      .catch(err => toast.error(err.message || 'Failed to load resumes.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const r = await uploadFile(
        ENDPOINTS.resume.upload,
        file,
        'resume',
        (loaded, total) => setUploadProgress(Math.round(loaded / total * 100))
      );
      toast.success(`"${r.data.resume.original_name}" uploaded and parsed successfully!`);
      load();
    } catch (err) {
      toast.error(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleActivate = async (id) => {
    try {
      await api.put(buildUrl(ENDPOINTS.resume.activate, { id }));
      toast.success('Resume set as active.');
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to activate resume.');
    }
  };

  const handleDelete = async (id, name) => {
    const ok = await confirm(`Delete "${name}"? This cannot be undone.`, { danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(buildUrl(ENDPOINTS.resume.delete, { id }));
      toast.info('Resume deleted.');
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to delete resume.');
    }
  };

  const handlePreview = async (id) => {
    try {
      const r = await api.get(buildUrl(ENDPOINTS.resume.get, { id }));
      setPreview(r.data.resume);
    } catch (err) {
      toast.error(err.message || 'Failed to load resume preview.');
    }
  };

  const handleDownload = async (id, name) => {
    try {
      await downloadFile(buildUrl(ENDPOINTS.resume.download, { id }), name || 'resume');
    } catch {
      toast.error('Download failed. File may have been deleted from server.');
    }
  };

  return (
    <div>
      <SectionTitle sub="Upload your resume. The AI will parse it and use it for all job matching and applications.">
        Resume Manager
      </SectionTitle>

      {/* Upload Zone */}
      <Card glow style={{ marginBottom: 24 }}>
        <div
          onClick={() => !uploading && fileRef.current.click()}
          style={{
            border: '2px dashed #1e2d47', borderRadius: 10, padding: '40px 20px', textAlign: 'center',
            cursor: uploading ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
          }}
          onMouseEnter={e => !uploading && (e.currentTarget.style.borderColor = '#2563eb')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e2d47')}
        >
          {uploading ? (
            <div>
              <Loader text={uploadProgress > 0 ? `Uploading… ${uploadProgress}%` : 'Uploading & parsing resume…'} />
              {uploadProgress > 0 && (
                <div style={{ marginTop: 12, height: 4, background: '#1a2236', borderRadius: 99, overflow: 'hidden', maxWidth: 300, margin: '12px auto 0' }}>
                  <div style={{ height: '100%', width: `${uploadProgress}%`, background: '#2563eb', borderRadius: 99, transition: 'width 0.3s' }} />
                </div>
              )}
            </div>
          ) : (
            <>
              <Upload size={36} color="#2563eb" style={{ marginBottom: 12 }} />
              <p style={{ fontWeight: 700, color: '#cbd5e1', marginBottom: 6 }}>Drop your resume here or click to upload</p>
              <p style={{ fontSize: 13, color: '#475569' }}>Supports PDF and DOCX — Max 10 MB</p>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".pdf,.docx,.doc" style={{ display: 'none' }} onChange={handleUpload} />
      </Card>

      {/* Resume List */}
      {loading ? <Loader /> : resumes.length === 0 ? (
        <Empty icon={FileText} title="No resumes yet" sub="Upload your resume above to get started." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {resumes.map(r => (
            <Card key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: r.is_active ? 'rgba(37,99,235,0.15)' : '#161d2e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={20} color={r.is_active ? '#60a5fa' : '#475569'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 14, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.original_name}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {r.is_active ? <Badge color="green">Active</Badge> : <Badge color="gray">Inactive</Badge>}
                  <Badge color="blue">{r.file_type?.toUpperCase()}</Badge>
                  {r.parsed_text ? <Badge color="purple">Parsed ✓</Badge> : <Badge color="yellow">Not Parsed</Badge>}
                  <span style={{ fontSize: 11, color: '#334155', fontFamily: 'Space Mono,monospace', alignSelf: 'center' }}>
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {!r.is_active && (
                  <Btn variant="success" size="sm" onClick={() => handleActivate(r.id)}>
                    <CheckCircle size={14} /> Set Active
                  </Btn>
                )}
                <Btn variant="ghost" size="sm" onClick={() => handlePreview(r.id)} title="Preview parsed text">
                  <Eye size={14} />
                </Btn>
                <Btn variant="ghost" size="sm" onClick={() => handleDownload(r.id, r.original_name)} title="Download file">
                  <Download size={14} />
                </Btn>
                <Btn variant="danger" size="sm" onClick={() => handleDelete(r.id, r.original_name)}>
                  <Trash2 size={14} />
                </Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {preview && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setPreview(null)}
        >
          <div
            style={{ background: '#0d1117', border: '1px solid #1a2236', borderRadius: 14, maxWidth: 700, width: '100%', maxHeight: '80vh', overflow: 'auto', padding: 28 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ color: '#f1f5f9', fontWeight: 700 }}>{preview.original_name}</h3>
              <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 20 }}>×</button>
            </div>
            <pre style={{ fontFamily: 'Space Mono,monospace', fontSize: 12, color: '#94a3b8', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {preview.parsed_text || 'No parsed text available for this resume.'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
