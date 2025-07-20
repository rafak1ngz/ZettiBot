# 🚀 ZettiBot

**Assistente Digital de Vendas para Telegram**

*Transforme caos em estratégia e potencialize seus resultados comerciais*

![Next.js](https://img.shields.io/badge/Next.js-14.0.2-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.2.2-blue?style=flat-square&logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Latest-green?style=flat-square&logo=supabase)
![Telegram](https://img.shields.io/badge/Telegram-Bot_API-blue?style=flat-square&logo=telegram)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-black?style=flat-square&logo=vercel)
![Version](https://img.shields.io/badge/Version-1.0.0-green?style=flat-square)
![Status](https://img.shields.io/badge/Status-Production_Ready-brightgreen?style=flat-square)
![Uptime](https://img.shields.io/badge/Uptime-99.9%25-brightgreen?style=flat-square)

---

## 📋 Sobre o Projeto

ZettiBot é um assistente digital inovador desenvolvido especificamente para vendedores externos. Através do Telegram, oferece uma suite completa de ferramentas para gestão de clientes, agenda e sistema de notificações automáticas.

### 🎯 **Funcionalidades Implementadas (v1.0.0)**

- 👥 **Gestão Completa de Clientes** - CRUD com validações robustas e busca avançada
- 📅 **Agenda Inteligente** - Compromissos com paginação e edição completa
- 🔔 **Sistema de Notificações** - Lembretes automáticos de 15min a 24h antes
- ⏰ **Fuso Horário Brasileiro** - Gestão correta de horários UTC-3
- 🔍 **Busca Avançada** - Por nome, CNPJ ou contato
- 📱 **Interface Conversacional** - Interação natural via Telegram

### ✨ **Diferenciais Técnicos**

- **Arquitetura Modular** - Código limpo, escalável e bem estruturado
- **TypeScript Rigoroso** - Tipagem forte e validações robustas
- **Multi-etapas Inteligente** - Conversas que guiam o usuário naturalmente  
- **Cache Otimizado** - Performance melhorada com cache de usuários
- **Rate Limiting** - Proteção contra spam e uso excessivo
- **Logs de Auditoria** - Rastreamento completo de ações

---

## 🎯 **STATUS ATUAL (v1.0.0)**

### ✅ **FUNCIONALIDADES COMPLETAS (100%)**

#### **🏗️ Sistema Base**
- ✅ Cadastro/autenticação de usuários
- ✅ Menu principal navegável
- ✅ Sistema de cancelamento universal
- ✅ Middleware de autenticação robusto
- ✅ Cache de usuários para performance

#### **👥 Gestão de Clientes**
- ✅ CRUD completo (criar, listar, editar, excluir)
- ✅ Validações robustas (CNPJ real, telefone, email)
- ✅ Busca avançada (nome, CNPJ, contato)
- ✅ Paginação automática inteligente
- ✅ Formatação de dados brasileira
- ✅ Sanitização e limpeza de inputs

#### **📅 Gestão de Agenda**
- ✅ Criar compromissos (com/sem cliente vinculado)
- ✅ Editar compromissos existentes
- ✅ Listar com paginação inteligente
- ✅ Concluir/cancelar compromissos
- ✅ Busca e vinculação de clientes
- ✅ Validação de datas/horários futuro

#### **🔔 Sistema de Notificações**
- ✅ Lembretes personalizáveis (15min, 30min, 1h, 5h, 12h, 24h)
- ✅ Processamento automático via cron-job externo
- ✅ Retry automático com até 3 tentativas
- ✅ Limpeza automática de notificações antigas
- ✅ Gestão correta de fuso horário brasileiro

#### **🛡️ Segurança e Performance**
- ✅ Rate limiting para prevenir spam
- ✅ Timeouts em operações de banco
- ✅ Validação rigorosa de inputs
- ✅ Logs de auditoria detalhados
- ✅ Tratamento robusto de erros

### 🚧 **PLANEJADO PARA PRÓXIMAS VERSÕES**
- 🔄 **Follow-up de Leads** - Sistema de acompanhamento de negociações
- 📝 **Lembretes Customizados** - Além de compromissos de agenda
- 📊 **Relatórios e Analytics** - Métricas de vendas e performance
- 🗺️ **Rotas Otimizadas** - Planejamento inteligente de visitas
- 🌐 **Dashboard Web** - Interface administrativa

---

## 🛠️ Stack Tecnológica

| Tecnologia | Versão | Propósito |
|------------|--------|-----------|
| **Next.js** | 14.0.2 | Framework React para API |
| **TypeScript** | 5.2.2 | Tipagem estática rigorosa |
| **Supabase** | Latest | Banco PostgreSQL + Auth |
| **Telegraf** | 4.15.0 | SDK Telegram Bot API |
| **Vercel** | - | Deploy e hospedagem |
| **date-fns** | 2.30.0 | Manipulação de datas com locale PT-BR |
| **Zod** | 3.22.4 | Validação de schemas |

---

## 🚀 Início Rápido

### 📋 **Pré-requisitos**

- Node.js 18+ 
- npm ou yarn
- Conta no Supabase
- Bot Token do Telegram (via @BotFather)
- Conta na Vercel (deploy gratuito)
- Serviço de cron-job (EasyCron recomendado)

### ⚡ **Instalação Local**

```bash
# 1. Clone o repositório
git clone https://github.com/rafak1ngz/ZettiBot.git
cd ZettiBot

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env.local
# Edite o .env.local com suas chaves

# 4. Execute em desenvolvimento
npm run dev

---

## 🙏 Agradecimentos

- **Equipe Telegram** pela excelente Bot API
- **Vercel** pela plataforma de deploy gratuita
- **Supabase** pelo backend completo
- **Claude (Anthropic)** pela parceria incansável no desenvolvimento e arquitetura
- **Comunidade Open Source** pelas bibliotecas incríveis

---

<div align="center">

**Desenvolvido com ❤️ por [Rafael Dantas](https://github.com/rafak1ngz)**

**ZettiBot** - *Transformando caos em estratégia desde 2025*

[⭐ Star no GitHub](https://github.com/rafak1ngz/ZettiBot) • [🐛 Reportar Bug](https://github.com/rafak1ngz/ZettiBot/issues) • [💡 Sugerir Feature](https://github.com/rafak1ngz/ZettiBot/issues)

</div>