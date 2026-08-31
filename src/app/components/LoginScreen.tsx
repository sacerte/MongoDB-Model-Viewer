import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, InputAdornment, Paper, TextField, Typography } from '@mui/material';
import { ArrowRight, LockKeyhole, Mail } from 'lucide-react';
import { MongoDBMark } from './MongoDBMark';
import { supabase } from '../utils/supabase';
declare global { interface Window { turnstile?: { render: (e: HTMLElement, o: any) => string }; MONGODB_MODELER_CONFIG?: { turnstileSiteKey?: string; }; } }

interface Props {
  onAuthenticated: () => void;
}

export default function LoginScreen({ onAuthenticated }: Props) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(''); const captchaRef = useRef<HTMLDivElement>(null); const siteKey = window.desktopApp ? undefined : window.MONGODB_MODELER_CONFIG?.turnstileSiteKey;
  useEffect(() => { if (!siteKey || !captchaRef.current) return; const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.onload=()=>window.turnstile?.render(captchaRef.current!,{sitekey:siteKey,callback:setCaptchaToken});document.head.appendChild(s); },[siteKey]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || (siteKey && !captchaToken)) { setError('Completa la verificación de seguridad.'); return; }
    setLoading(true);
    setError('');
    setMessage('');
    const result = isRegistering
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin, captchaToken } })
      : await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (isRegistering && !result.data.session) {
      setMessage('Cuenta creada. Revisa tu correo para confirmar la dirección antes de iniciar sesión.');
      return;
    }
    onAuthenticated();
  };

  return (
    <Box sx={{ minHeight: '100%', position: 'relative', overflow: 'hidden', display: 'grid', placeItems: 'center', p: { xs: 2, sm: 4 }, bgcolor: '#08111f', background: 'radial-gradient(circle at 12% 16%, rgba(20,184,166,.24), transparent 27%), radial-gradient(circle at 88% 82%, rgba(37,99,235,.27), transparent 32%), #08111f' }}>
      <Box sx={{ position: 'absolute', width: 460, height: 460, borderRadius: '50%', border: '1px solid rgba(45,212,191,.13)', top: -260, left: -160 }} />
      <Box sx={{ position: 'absolute', width: 560, height: 560, borderRadius: '50%', border: '1px solid rgba(96,165,250,.12)', bottom: -360, right: -160 }} />
      <Paper component="form" onSubmit={submit} elevation={0} sx={{ position: 'relative', width: '100%', maxWidth: 450, overflow: 'hidden', borderRadius: 4, border: '1px solid rgba(148,163,184,.25)', bgcolor: 'rgba(15,23,42,.88)', boxShadow: '0 28px 80px rgba(0,0,0,.42)', color: '#f8fafc' }}>
        <Box sx={{ p: { xs: 3, sm: 4 }, borderBottom: '1px solid rgba(148,163,184,.16)', background: 'linear-gradient(120deg, rgba(20,184,166,.12), rgba(37,99,235,.13))' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75 }}>
            <Box sx={{ display: 'grid', placeItems: 'center', width: 52, height: 52, borderRadius: 3, bgcolor: 'rgba(16,185,129,.13)', border: '1px solid rgba(52,211,153,.24)' }}><MongoDBMark className="h-8 w-8" /></Box>
            <Box><Typography variant="h5" fontWeight={750} letterSpacing="-.03em">MongoDB Modeler</Typography><Typography variant="body2" sx={{ mt: .25, color: '#94a3b8' }}>v1.0.8 · Web colaborativa</Typography></Box>
          </Box>
        </Box>
        <Box sx={{ p: { xs: 3, sm: 4 } }}>
          <Typography variant="h6" fontWeight={700}>{isRegistering ? 'Crea tu espacio de trabajo' : 'Bienvenido de nuevo'}</Typography>
          <Typography variant="body2" sx={{ mt: .75, mb: 2.5, color: '#a8b5c9' }}>{isRegistering ? 'Regístrate para guardar y compartir tus modelos.' : 'Inicia sesión para continuar con tus proyectos.'}</Typography>
          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
          {message && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{message}</Alert>}
          <TextField label="Correo electrónico" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth margin="normal" autoComplete="email" InputProps={{ startAdornment: <InputAdornment position="start"><Mail size={18} color="#94a3b8" /></InputAdornment> }} sx={loginFieldSx} />
          <TextField label="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth margin="normal" autoComplete={isRegistering ? 'new-password' : 'current-password'} inputProps={{ minLength: 6 }} helperText={isRegistering ? 'Mínimo 6 caracteres.' : ''} InputProps={{ startAdornment: <InputAdornment position="start"><LockKeyhole size={18} color="#94a3b8" /></InputAdornment> }} sx={loginFieldSx} />
          {siteKey && <Box ref={captchaRef} sx={{ mt: 2, minHeight: 65 }} />}
          <Button type="submit" variant="contained" fullWidth disabled={loading} endIcon={!loading && <ArrowRight size={18} />} sx={{ mt: 2.25, height: 46, fontWeight: 700, bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}>{loading ? 'Procesando…' : isRegistering ? 'Crear cuenta' : 'Entrar al espacio de trabajo'}</Button>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, my: 2.25 }}><Box sx={{ height: 1, flex: 1, bgcolor: 'rgba(148,163,184,.18)' }} /><Typography variant="caption" color="#94a3b8">o</Typography><Box sx={{ height: 1, flex: 1, bgcolor: 'rgba(148,163,184,.18)' }} /></Box>
          <Button type="button" fullWidth onClick={() => { setIsRegistering(!isRegistering); setError(''); setMessage(''); }} sx={{ color: '#67e8f9', fontWeight: 650 }}>
            {isRegistering ? 'Ya tengo una cuenta · Iniciar sesión' : '¿No tienes cuenta? · Crear cuenta'}
          </Button>
        </Box>
      </Paper>
      <Typography variant="caption" sx={{ position: 'absolute', bottom: 20, color: 'rgba(203,213,225,.66)' }}>Tus proyectos y tu sesión están protegidos con Supabase.</Typography>
    </Box>
  );
}

const loginFieldSx = {
  '& .MuiInputLabel-root': { color: '#a8b5c9' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#67e8f9' },
  '& .MuiOutlinedInput-root': { color: '#f8fafc', backgroundColor: 'rgba(2,6,23,.4)' },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(148,163,184,.34)' },
  '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(103,232,249,.65)' },
  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#22d3ee' },
  '& .MuiFormHelperText-root': { color: '#94a3b8' }
};
