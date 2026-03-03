# Controle de Estoque

Sistema com autenticao, controle de produtos, entradas, saidas e relatorios PDF.

## Requisitos
- Node.js 18+
- MongoDB Atlas ou local

## Configuracao local

### Backend
1. Copie `backend/.env.example` para `backend/.env`
2. Preencha os valores, principalmente:
   - `MONGO_URI`
   - `JWT_SECRET` (segredo forte e unico)
   - `CORS_ORIGIN` (ex.: `http://localhost:5173`)
   - `FRONTEND_URL` (ex.: `http://localhost:5173`)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
3. Rode:

```bash
cd backend
npm install
npm run seed
npm run dev
```

### Frontend
1. Copie `frontend/.env.example` para `frontend/.env`
2. Ajuste `VITE_API_URL`
3. Rode:

```bash
cd frontend
npm install
npm run dev
```

## Melhorias de seguranca aplicadas
- Cadastro nao aceita mais `role` do cliente (sempre cria `user`).
- JWT armazenado em cookie `HttpOnly` com `SameSite=Lax`.
- CORS restrito por lista de origens via `CORS_ORIGIN`.
- `helmet` habilitado para headers de seguranca.
- Rate limit no endpoint de login.
- Recuperacao de senha por email com token de uso unico e expiracao.
- Validacao e sanitizacao de payloads no backend.
- Bloqueio de chaves perigosas (`$` e `.`) para reduzir risco de NoSQL injection.
- Politica minima de senha com 6 caracteres.
- Credenciais fixas removidas do seed.
- Logs de auditoria para login, cadastro, logout, CRUD de produtos, movimentacoes e relatorios.

## Deploy
- Configure variaveis de ambiente do backend com os mesmos nomes do `.env.example`.
- Em producao, use `NODE_ENV=production` para cookie `Secure`.
