# 🤝 Guia de Contribuição - ZettiBot

Obrigado pelo interesse em contribuir com o ZettiBot! Este guia detalha como você pode ajudar a melhorar o projeto.

## 🎯 Como Contribuir

### 🐛 **Reportando Bugs**

Se você encontrou um bug, por favor:

1. **Verifique** se o bug já foi reportado nas [Issues](https://github.com/rafak1ngz/ZettiBot/issues)
2. **Crie uma nova issue** com as seguintes informações:
   - Descrição detalhada do problema
   - Passos para reproduzir
   - Comportamento esperado vs atual
   - Screenshots/logs se aplicável
   - Ambiente (Node.js version, OS, etc.)

### 💡 **Sugerindo Features**

Para sugerir melhorias:

1. **Abra uma issue** com o label `enhancement`
2. **Descreva claramente** a funcionalidade proposta
3. **Explique o caso de uso** e benefícios
4. **Inclua mockups** se aplicável

### 🔧 **Desenvolvendo Features**

#### **Preparação do Ambiente**

```bash
# 1. Fork o repositório no GitHub

# 2. Clone seu fork
git clone https://github.com/SEU-USERNAME/ZettiBot.git
cd ZettiBot

# 3. Adicione o repositório original como upstream
git remote add upstream https://github.com/rafak1ngz/ZettiBot.git

# 4. Instale dependências
npm install

# 5. Configure ambiente local
cp .env.example .env.local
# Configure suas variáveis de ambiente
```

#### **Fluxo de Desenvolvimento**

```bash
# 1. Atualize sua main branch
git checkout main
git pull upstream main

# 2. Crie uma branch para sua feature
git checkout -b feature/nome-da-feature

# 3. Desenvolva sua feature
# ... faça suas alterações ...

# 4. Commit suas mudanças
git add .
git commit -m "feat: adiciona nova funcionalidade X"

# 5. Push para seu fork
git push origin feature/nome-da-feature

# 6. Abra um Pull Request
```

## 📋 Padrões de Código

### 🏗️ **Arquitetura**

- **Modularidade**: Cada funcionalidade em pasta separada
- **Responsabilidade Única**: Um arquivo, uma responsabilidade
- **Separação Clara**: handlers.ts, callbacks.ts, validation.ts

### 💻 **TypeScript**

```typescript
// ✅ Bom - Tipos explícitos
interface Cliente {
  id: string;
  nome_empresa: string;
  cnpj?: string;
}

// ✅ Bom - Validação de tipos
if (!ctx.message || !('text' in ctx.message)) return;

// ❌ Evitar - any
function processData(data: any) { }

// ✅ Preferir - tipos específicos
function processData(data: Cliente) { }
```

### 🔧 **Padrões de Função**

```typescript
// ✅ Handlers sempre com prefixo handle
export async function handleClientes(ctx: Context) { }

// ✅ Callbacks sempre com prefixo register
export function registerClientesCallbacks(bot: Telegraf) { }

// ✅ Validação antes de processar mensagem
if (!ctx.message || !('text' in ctx.message)) return;

// ✅ Try/catch em operações async
try {
  await adminSupabase.from('clientes').insert(data);
} catch (error) {
  console.error('Erro ao inserir cliente:', error);
  await ctx.reply('Ocorreu um erro. Tente novamente.');
}
```

### 🎨 **Mensagens do Bot**

```typescript
// ✅ Tom amigável mas profissional
"✅ Cliente cadastrado com sucesso!"

// ✅ Instruções claras
"Digite o nome da empresa que deseja buscar:"

// ✅ Erro com orientação
"CNPJ inválido. Por favor, digite um CNPJ com 14 dígitos."

// ❌ Evitar tom técnico
"Error: Invalid CNPJ format"
```

## 📁 Estrutura de Arquivos

### **Para Novo Módulo:**

```
src/lib/telegram/commands/[modulo]/
├── index.ts                    # Exports
├── handlers.ts                 # Lógica principal
├── callbacks.ts                # Botões inline
└── validation.ts               # Validações específicas (se necessário)
```

### **Conversação:**

```
src/lib/telegram/middleware/conversation/
└── [modulo]Conversation.ts     # Processamento multi-etapas
```

## 🧪 Testes

### **Padrões de Teste**

```typescript
// Estrutura de teste
describe('Clientes Module', () => {
  it('should validate CNPJ correctly', () => {
    expect(validators.cnpj('12345678901234')).toBe(true);
    expect(validators.cnpj('123')).toBe(false);
  });
});
```

### **Executar Testes**

```bash
npm run test          # Executar todos os testes
npm run test:watch    # Modo watch
npm run test:coverage # Com coverage
```

## 📝 Padrões de Commit

Usamos **Conventional Commits**:

```bash
# Features
feat: adiciona módulo de follow-up
feat(agenda): implementa edição de compromissos

# Correções
fix: corrige validação de CNPJ
fix(clientes): resolve bug de paginação

# Documentação
docs: atualiza README com novos comandos
docs(api): adiciona documentação de endpoints

# Refatoração
refactor: modulariza sistema de conversação
refactor(commands): separa callbacks em arquivos

# Testes
test: adiciona testes para módulo clientes
test(validation): aumenta cobertura de validators

# Chores
chore: atualiza dependências
chore: configura CI/CD
```

## 🔍 Code Review

### **Checklist do Revisor**

- [ ] Código segue padrões do projeto
- [ ] TypeScript sem warnings
- [ ] Funções têm tratamento de erro
- [ ] Mensagens do bot são amigáveis
- [ ] Documentação atualizada se necessário
- [ ] Testes passando
- [ ] Performance adequada

### **Para o Contribuidor**

- Teste localmente antes do PR
- Descreva claramente o que foi alterado
- Inclua screenshots se aplicável
- Mantenha PR focado em uma funcionalidade
- Responda aos comentários do review

## 🎯 Prioridades de Contribuição

### 🔥 **Alta Prioridade**
- Finalizar módulo de agenda
- Implementar follow-up de leads
- Adicionar testes automatizados
- Melhorar tratamento de erros

### 🔶 **Média Prioridade**
- Sistema de lembretes
- Relatórios e analytics
- Dashboard web
- Integração com APIs externas

### 🔷 **Baixa Prioridade**
- Otimizações de performance
- Melhorias de UI/UX
- Documentação adicional
- Internationalization

## 💡 Dicas para Contribuidores

### 🚀 **Para Iniciantes**
- Comece com issues marcadas como `good first issue`
- Foque em correções de bugs simples
- Melhore documentação existente
- Adicione validações de dados

### 🏆 **Para Experientes**
- Implemente novos módulos completos
- Otimize arquitetura existente
- Adicione testes automatizados
- Configure CI/CD

## 📞 Precisa de Ajuda?

- 💬 **Discord**: [Link do servidor]
- 📧 **Email**: dev@zettibot.com
- 🐛 **Issues**: Para dúvidas técnicas
- 📖 **Docs**: [Documentação técnica completa]

---

## 🙏 Reconhecimento

Todos os contribuidores são reconhecidos no README e releases. Obrigado por ajudar a tornar o ZettiBot melhor! 🚀

---

*Este guia é vivo e evolui com o projeto. Sugestões de melhorias são bem-vindas!*