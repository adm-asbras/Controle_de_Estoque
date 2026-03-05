const mongoose = require("mongoose");

// Usuarios da aplicacao com credenciais e perfil de acesso.
const UserSchema = new mongoose.Schema(
  {
    // Login publico do usuario.
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 32 },
    // Email unico para contato e recuperacao futura.
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 120 },
    // Apenas hash da senha; senha pura nunca e salva.
    passwordHash: { type: String, required: true },
    // Hash do token temporario de recuperacao de senha (uso unico).
    passwordResetTokenHash: { type: String, default: null },
    // Data de expiracao do token de recuperacao.
    passwordResetExpiresAt: { type: Date, default: null },
    // Controle de autorizacao: admin gestor de contas, admin operacional ou user.
    role: { type: String, enum: ["admin", "admin_limited", "user"], required: true, default: "user" }
  },
  // createdAt e updatedAt automaticos.
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
