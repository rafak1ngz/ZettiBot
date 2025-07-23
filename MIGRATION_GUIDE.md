# 🔄 Guia de Migração - ZettiBot v1.2.0

Este guia detalha o processo completo de atualização do ZettiBot da versão 1.1.0 para 1.2.0, incluindo o novo sistema de follow-up.

---

## 📋 **Pré-requisitos**

### ✅ **Verificações Obrigatórias**
- [ ] Backup completo do banco Supabase
- [ ] Acesso admin ao dashboard Supabase
- [ ] Acesso ao dashboard Vercel
- [ ] Git configurado localmente
- [ ] Node.js 18+ instalado

### 📊 **Informações Necessárias**
- **Versão Atual**: 1.1.0 ou superior
- **Tempo Estimado**: 10-15 minutos
- **Downtime**: Zero (atualização transparente)
- **Compatibilidade**: 100% retrocompatível

---

## 🔒 **Passo 1: Backup de Segurança**

### **1.1 Backup do Banco de Dados**

```sql
-- Execute no SQL Editor do Supabase para criar backup
CREATE SCHEMA IF NOT EXISTS backup_v110;

-- Backup de todas as tabelas principais
CREATE TABLE backup_v110.users AS SELECT * FROM users;
CREATE TABLE backup_v110.clientes AS SELECT * FROM clientes;
CREATE TABLE backup_v110.compromissos AS SELECT * FROM compromissos;
CREATE TABLE backup_v110.lembretes AS SELECT * FROM lembretes;
CREATE TABLE backup_v110.notificacoes AS SELECT * FROM notificacoes;
CREATE TABLE backup_v110.sessions AS SELECT * FROM sessions;
CREATE TABLE backup_v110.audit_logs AS SELECT * FROM audit_logs;
```

### **1.2 Backup do Código**

```bash
# Criar tag da versão atual
git tag v1.1.0-backup
git push origin v1.1.0-backup

# Criar branch de backup
git checkout -b backup-v1.1.0
git push origin backup-v1.1.0
git checkout main
```

---

## 📥 **Passo 2: Atualização do Código**

### **2.1 Obter Nova Versão**

```bash
# Atualizar repositório local
git fetch origin
git pull origin main

# Verificar versão
grep '"version"' package.json
# Deve mostrar: "version": "1.2.0"
```

### **2.2 Instalar Dependências**

```bash
# Limpar node_modules (recomendado)
rm -rf node_modules package-lock.json

# Instalar dependências atualizadas
npm install

# Verificar se tudo está OK
npm run build
```

---

## 🗄️ **Passo 3: Atualização do Banco**

### **3.1 Criar Novas Tabelas**

Execute no **SQL Editor** do Supabase:

```sql
-- ============================================================================
-- TABELA FOLLOWUPS
-- ============================================================================
CREATE TABLE IF NOT EXISTS followups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
  titulo VARCHAR(200) NOT NULL,
  estagio VARCHAR(50) NOT NULL CHECK (estagio IN ('prospeccao', 'apresentacao', 'proposta', 'negociacao', 'fechamento')),
  valor_estimado DECIMAL(15,2),
  data_inicio TIMESTAMPTZ DEFAULT NOW(),
  data_prevista TIMESTAMPTZ,
  ultimo_contato TIMESTAMPTZ DEFAULT NOW(),
  proxima_acao TEXT,
  descricao TEXT,
  status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo', 'ganho', 'perdido')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABELA CONTATOS_FOLLOWUP
-- ============================================================================
CREATE TABLE IF NOT EXISTS contatos_followup (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  followup_id UUID REFERENCES followups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  data_contato TIMESTAMPTZ DEFAULT NOW(),
  tipo_contato VARCHAR(20) NOT NULL CHECK (tipo_contato IN ('ligacao', 'email', 'reuniao', 'whatsapp', 'visita', 'outro')),
  resumo TEXT NOT NULL,
  proxima_acao TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### **3.2 Criar Triggers e Índices**

```sql
-- ============================================================================
-- TRIGGER PARA UPDATED_AT
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_followups_updated_at BEFORE UPDATE
ON followups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_followups_user_status ON followups(user_id, status);
CREATE INDEX IF NOT EXISTS idx_followups_cliente ON followups(cliente_id);
CREATE INDEX IF NOT EXISTS idx_followups_data_prevista ON followups(data_prevista);
CREATE INDEX IF NOT EXISTS idx_contatos_followup ON contatos_followup(followup_id);
CREATE INDEX IF NOT EXISTS idx_contatos_user_data ON contatos_followup(user_id, data_contato DESC);
```

### **3.3 Configurar RLS (Row Level Security)**

```sql
-- ============================================================================
-- HABILITAR RLS
-- ============================================================================
ALTER TABLE followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE contatos_followup ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLÍTICAS DE SEGURANÇA
-- ============================================================================
-- Followups: usuários podem gerenciar apenas seus próprios
CREATE POLICY "Users can manage their own followups" ON followups
FOR ALL USING (user_id = auth.uid());

-- Contatos: usuários podem gerenciar apenas seus próprios
CREATE POLICY "Users can manage their own contacts" ON contatos_followup
FOR ALL USING (user_id = auth.uid());
```

### **3.4 Verificar Tabelas Criadas**

```sql
-- Verificar se tabelas foram criadas corretamente
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('followups', 'contatos_followup');

-- Verificar políticas RLS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('followups', 'contatos_followup');
```

---

## 🚀 **Passo 4: Deploy da Aplicação**

### **4.1 Deploy via Vercel**

```bash
# Método 1: Deploy automático (recomendado)
git add .
git commit -m "feat: implementa sistema completo de follow-up v1.2.0

- Adiciona pipeline de vendas com 5 estágios
- Implementa histórico de contatos detalhado
- Cria sistema de notificações para follow-up
- Adiciona interface conversacional avançada
- Mantém 100% de compatibilidade com v1.1.0"

git push origin main

# Aguardar deploy automático no dashboard Vercel
```

```bash
# Método 2: Deploy manual (se necessário)
npx vercel --prod
```

### **4.2 Verificar Deploy**

```bash
# Verificar status do webhook
curl -X POST "https://api.telegram.org/bot{SEU_TOKEN}/getWebhookInfo"

# Resposta esperada deve conter sua URL da Vercel
```

---

## 🔍 **Passo 5: Testes de Validação**

### **5.1 Teste Básico do Bot**

1. **Abrir Telegram** e localizar seu bot
2. **Enviar `/start`** - deve funcionar normalmente
3. **Enviar `/ajuda`** - deve listar todos os comandos incluindo `/followup`
4. **Testar módulos existentes**:
   - `/clientes` - deve funcionar normalmente
   - `/agenda` - deve funcionar normalmente  
   - `/lembretes` - deve funcionar normalmente

### **5.2 Teste do Novo Sistema Follow-up**

```
1. Enviar: /followup
   ✅ Deve mostrar: Menu com opções de follow-up

2. Clicar: "🆕 Novo Follow-up"
   ✅ Deve solicitar: Busca de cliente

3. Digitar: Nome de cliente existente
   ✅ Deve mostrar: Lista de clientes encontrados

4. Seguir fluxo completo:
   ✅ Título → Estágio → Valor → Data → Próxima ação
```

### **5.3 Teste de Notificações**

```bash
# Testar endpoint de notificações
curl -X POST "https://seu-app.vercel.app/api/notifications/test" \
     -H "Authorization: Bearer {WEBHOOK_SECURITY_KEY}" \
     -H "Content-Type: application/json" \
     -d '{"telegram_id": SEU_TELEGRAM_ID, "tipo_teste": "followup"}'
```

---

## 📊 **Passo 6: Monitoramento Pós-Deploy**

### **6.1 Verificar Logs**

```bash
# Dashboard Vercel → Functions → View Function Logs
# Verificar se não há erros críticos nos últimos 10 minutos
```

### **6.2 Verificar Banco de Dados**

```sql
-- Verificar se novas tabelas estão funcionando
SELECT COUNT(*) as total_followups FROM followups;
SELECT COUNT(*) as total_contatos FROM contatos_followup;

-- Verificar logs de auditoria
SELECT * FROM audit_logs 
WHERE acao LIKE '%followup%' 
ORDER BY timestamp DESC 
LIMIT 5;
```

### **6.3 Monitorar Performance**

- **Dashboard Supabase**: Verificar CPU e memória
- **Dashboard Vercel**: Verificar function duration
- **Bot Telegram**: Verificar tempo de resposta

---

## 🆘 **Rollback (Se Necessário)**

### **Cenários para Rollback**
- Erros críticos no bot
- Performance degradada significativamente
- Problemas de compatibilidade

### **Processo de Rollback**

```bash
# 1. Reverter código para v1.1.0
git checkout backup-v1.1.0
git push origin main --force

# 2. Deploy da versão anterior
npx vercel --prod

# 3. Desabilitar novas tabelas (não remover)
```

```sql
-- SQL para desabilitar temporariamente (não executar DROP)
ALTER TABLE followups DISABLE TRIGGER ALL;
ALTER TABLE contatos_followup DISABLE TRIGGER ALL;
```

### **Reativação Após Correção**

```bash
# 1. Aplicar correções
git checkout main

# 2. Commit das correções
git commit -m "fix: corrige problemas pós-migração"

# 3. Deploy novamente
git push origin main
```

---

## 🎯 **Pós-Migração: Próximos Passos**

### **Para Administradores**

1. **Comunicar aos Usuários**
   - Anunciar nova funcionalidade
   - Enviar tutorial básico
   - Disponibilizar suporte

2. **Monitorar Métricas**
   - Uso do novo sistema de follow-up
   - Performance geral do bot
   - Feedback dos usuários

3. **Documentar Learnings**
   - Problemas encontrados
   - Melhorias identificadas
   - Próximas otimizações

### **Para Usuários**

1. **Explorar Novo Sistema**
   - Testar criação de follow-up
   - Registrar alguns contatos
   - Configurar notificações

2. **Migrar Dados (Se Aplicável)**
   - Criar follow-ups para leads existentes
   - Organizar pipeline de vendas
   - Configurar próximas ações

---

## 📚 **Recursos Adicionais**

### **Documentação**
- [README.md Atualizado](README.md)
- [Changelog Completo](CHANGELOG.md)
- [Release Notes v1.2.0](RELEASE_NOTES.md)

### **Suporte**
- **GitHub Issues**: [Reportar Problemas](https://github.com/rafak1ngz/ZettiBot/issues)
- **Email**: contato@zettibot.com
- **Telegram**: @ZettiBotSupport

### **Comunidade**
- **Discord**: [Servidor da Comunidade](#)
- **Telegram**: [Grupo de Usuários](#)

---

## ✅ **Checklist Final**

### **Pré-Deploy**
- [ ] Backup do banco realizado
- [ ] Backup do código criado
- [ ] Dependências atualizadas
- [ ] Build local executado com sucesso

### **Durante Deploy**
- [ ] Novas tabelas criadas
- [ ] Triggers e índices configurados
- [ ] RLS habilitado e testado
- [ ] Deploy da aplicação executado

### **Pós-Deploy**
- [ ] Bot respondendo corretamente
- [ ] Comando `/followup` funcionando
- [ ] Sistema de notificações operacional
- [ ] Performance monitorada
- [ ] Documentação atualizada

### **Validação Completa**
- [ ] Todos os módulos antigos funcionando
- [ ] Sistema de follow-up operacional
- [ ] Notificações sendo enviadas
- [ ] Logs sem erros críticos
- [ ] Usuários informados da atualização

---

<div align="center">

## 🎉 **Migração Concluída!**

**ZettiBot v1.2.0 com Sistema de Follow-up está operacional**

*Transformando leads em vendas desde 2025*

</div>