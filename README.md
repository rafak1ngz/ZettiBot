# ZettiBot - Assistente para Vendedores Externos

## Variáveis de Ambiente

Este projeto requer as seguintes variáveis de ambiente:

| Variável       | Descrição                                | Obrigatório |
|----------------|------------------------------------------|-------------|
| BOT_TOKEN      | Token do bot do Telegram                 | Sim         |
| SUPABASE_URL   | URL do seu projeto Supabase              | Sim         |
| SUPABASE_KEY   | Chave pública (anon key) do Supabase     | Sim         |
| WEBHOOK_URL    | URL completa para o webhook (opcional)   | Não         |

### Como configurar no Vercel

1. Acesse seu projeto no dashboard da Vercel
2. Vá em "Settings" > "Environment Variables"
3. Adicione cada variável e seu valor
4. Redeploy seu projeto para aplicar as mudanças

### Obtendo as variáveis

- **BOT_TOKEN**: Obtenha do @BotFather no Telegram
- **SUPABASE_URL**: Encontrado na página de configurações do projeto Supabase
- **SUPABASE_KEY**: Encontrada na seção "API" do Supabase (anon key)