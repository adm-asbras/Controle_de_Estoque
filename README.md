# ASBRAS • Controle de Estoque (Layout Profissional)

Inclui:
- Login (Admin vs Usuário) com JWT
- Produtos com setor: **Expediente / Escritorio / Limpeza / Copa. (Pode ser alterado)** 
- Alerta automático quando **Qtd ≤ Mínimo**
- Entradas (Admin) e Saídas (Usuário)
- Relatórios (Admin): PDF
- **Layout profissional** + **logo na página**

## Rodar local (VSCode)

### Backend
1) `backend/.env`:
```env
PORT=4000
MONGO_URI=<SUA_STRING_DO_ATLAS_AQUI>
JWT_SECRET=<SUA_CHAVE_AQUI>
```

2) Terminal:
```bash
cd backend
npm install
npm run seed
npm run dev
```

### Frontend
1) `frontend/.env`:
```env
VITE_API_URL=http://localhost:4000
```

2) Terminal:
```bash
cd frontend
npm install
npm run dev
```

## Deploy online (Render + Netlify)

### Backend (Render)
- Crie um Web Service apontando para o repo
- Build: `npm install`
- Start: `npm start`
- Env Vars: `MONGO_URI`, `JWT_SECRET`

### Frontend (Netlify)
- Base directory: `frontend`
- Build command: `npm run build`
- Publish directory: `frontend/dist`
- Environment variable:
  - `VITE_API_URL = https://<sua-api-no-render>`
