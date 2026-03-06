# Manual do Sistema de Controle de Estoque (Passo a Passo)

## 1. Visão geral
Este sistema controla:
- Cadastro de produtos
- Entradas de estoque
- Saídas de estoque
- Alertas de reposição (quando quantidade <= mínimo)
- Relatórios em PDF
- Gestão de contas (somente perfil administrador gestor)

Perfis de acesso:
- `Usuário`: registra saídas e consulta histórico próprio.
- `Administrador (sem cadastro)` (`admin_limited`): produtos, entradas, saídas e relatórios.
- `Administrador gestor` (`admin`): tudo acima + criação/edição/exclusão de contas.

## 2. Como acessar o sistema
1. Abra o link do frontend no navegador.
2. Informe `Usuário` e `Senha`.
3. Clique em `Entrar`.
4. O sistema redireciona automaticamente:
- Para `/admin/produtos` se o perfil for admin.
- Para `/usuario/saidas` se o perfil for usuário.

Se esquecer a senha, use `Recuperar acesso` na tela de login.

## 3. Menu lateral (após login)
No menu esquerdo você encontra:
- `Produtos`
- `Entradas`
- `Saídas`
- `Gestão de Contas` (somente admin gestor)
- `Relatórios`

Ações adicionais:
- `Documentação`
- `Trocar senha`
- `Sair`

## 4. Passo a passo: Produtos (admin)
Objetivo: cadastrar e manter itens do estoque.

1. Entre em `Produtos`.
2. No card `Cadastrar produto`, preencha:
- Nome do produto
- Categoria (`Expediente`, `Escritório`, `Limpeza`, `Copa`)
- Unidade (`Un`, `Pct`, `Ltr`, `Cx`)
- Quantidade mínima
3. Clique em `Criar`.
4. Para editar, altere os campos diretamente na tabela.
5. Para excluir, clique em `Excluir` na linha do produto.

Observações:
- `Quantidade` e `Mínimo` podem ser ajustados na própria tabela.
- Se `Quantidade <= Mínimo`, o status muda para `REPOR`.
- O card/carrossel `Produtos para Repor` mostra alertas ativos.

## 5. Passo a passo: Entradas (admin)
Objetivo: registrar reposições e compras.

1. Entre em `Entradas`.
2. Em `Lançar entrada`, selecione:
- Categoria
- Produto
- Quantidade
- Data
3. Clique em `Lançar entrada`.
4. Confira no `Histórico de entradas`.

Regra importante:
- Toda entrada soma automaticamente na quantidade do produto.

## 6. Passo a passo: Saídas (usuário e admin)
Objetivo: registrar retirada de materiais.

1. Entre em `Saídas`.
2. Selecione a categoria.
3. Escolha o produto.
4. Informe:
- Observação (opcional)
- Quantidade
- Data
5. Clique em `Confirmar saída`.
6. Valide no `Histórico de saídas`.

Regras importantes:
- O sistema não permite saída maior que o estoque disponível.
- A saída reduz automaticamente a quantidade do produto.
- Usuário comum vê apenas suas próprias saídas no histórico.

## 7. Passo a passo: Gestão de Contas (somente admin gestor)
Objetivo: administrar usuários do sistema.

### 7.1 Criar conta
1. Entre em `Gestão de Contas`.
2. Preencha:
- Usuário
- Email
- Senha
- Confirmar senha
- Nível de acesso
3. Clique em `Criar usuário`.

### 7.2 Alterar nível de acesso
1. Na lista de contas, localize o usuário.
2. No campo `Acesso`, selecione o novo perfil.

### 7.3 Excluir conta
1. Clique em `Excluir` no usuário desejado.
2. Confirme a exclusão.

Regras de segurança:
- Não é permitido alterar o próprio acesso.
- Não é permitido excluir a própria conta.
- O sistema protege para não remover o último `admin` gestor.

## 8. Passo a passo: Relatórios (admin)
Objetivo: exportar dados em PDF.

1. Entre em `Relatórios`.
2. Escolha o modo de filtro:
- `Por datas` (data inicial/final)
- `Por meses` (ano + meses selecionados)
3. Clique em um botão de download:
- `Baixar Estoque (PDF)`
- `Baixar Entradas (PDF)`
- `Baixar Saídas (PDF)`

Dica:
- No modo `Por meses`, o relatório sai consolidado por produto/categoria.

## 9. Passo a passo: Trocar senha (usuário autenticado)
1. No menu lateral, clique em `Trocar senha`.
2. Preencha:
- Senha atual
- Nova senha
- Confirmar nova senha
3. Clique em `Salvar nova senha`.

Regras:
- A nova senha deve ter no mínimo 6 caracteres.
- A nova senha deve ser diferente da atual.

## 10. Passo a passo: Recuperar senha (sem login)
1. Na tela de login, clique em `Recuperar acesso`.
2. Informe o email cadastrado e clique em `Enviar link`.
3. Abra o email recebido.
4. Clique no link de redefinição.
5. Cadastre a nova senha e confirme.

Observações:
- O token do link expira (padrão: 15 minutos).
- Se expirar, solicite novo link.

## 11. Mensagens de erro comuns
- `Credenciais invalidas`: usuário ou senha incorretos.
- `Estoque insuficiente`: quantidade solicitada em saída é maior que o saldo.
- `Token invalido ou expirado`: solicite novo link de recuperação.
- `Nao e permitido remover o ultimo gestor de contas`: crie/promova outro admin antes.

## 12. Procedimento de início rápido (ambiente local)

### 12.1 Backend
1. Copie `backend/.env.example` para `backend/.env`.
2. Configure no mínimo:
- `MONGO_URI`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `FRONTEND_URL`
- SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)
- Credenciais de seed (`SEED_ADMIN_PASSWORD`, `SEED_USER_PASSWORD`)
3. Execute:

```bash
cd backend
npm install
npm run seed
npm run dev
```

### 12.2 Frontend
1. Copie `frontend/.env.example` para `frontend/.env`.
2. Defina `VITE_API_URL` (ex.: `http://localhost:4000`).
3. Execute:

```bash
cd frontend
npm install
npm run dev
```

## 13. Checklist operacional diário
1. Validar login.
2. Conferir alertas de `REPOR`.
3. Registrar entradas recebidas.
4. Registrar saídas realizadas.
5. Emitir relatório do período.
6. Encerrar sessão (`Sair`).
