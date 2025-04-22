from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes
from config import *
from database import db
from datetime import datetime

async def inicio(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = str(update.effective_chat.id)
    logger.info("Comando /inicio recebido de chat_id %s", chat_id)
    
    user_ref = db.collection("users").document(chat_id)
    if not user_ref.get().exists:
        user_ref.set({"criado_em": datetime.now(TIMEZONE).isoformat()})
        logger.info("Novo usuário registrado: %s", chat_id)
    else:
        logger.info("Usuário %s já registrado", chat_id)
    
    await update.message.reply_text(
        "👋 *Bem-vindo ao ZettiBot, parceiro!* Estou aqui pra te ajudar a organizar visitas, follow-ups e interações.\n\n"
        "Usa /visita pra registrar uma visita, /followup pra adicionar um follow-up ou /interacao pra uma interação.\n"
        "Quer ver quem visitar hoje? É só dizer /quemvisitar!\n\n"
        "📖 Não sabe por onde começar? Digita /ajuda pra ver todos os comandos disponíveis!",
        parse_mode="Markdown"
    )

async def ajuda(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = (
        "🔵 *ZettiBot - Seu parceiro de vendas*\n\n"
        "Tô aqui pra te ajudar a vender mais e se organizar sem dor de cabeça! 😎\n"
        "*O que eu faço?*\n"
        "• /inicio – Boas-vindas e comandos\n"
        "• /followup – Agenda um follow-up com cliente\n"
        "• /visita – Registra uma visita que você fez\n"
        "• /interacao – Anota uma conversa ou reunião\n"
        "• /lembrete – Te avisa na hora certa\n"
        "• /relatorio – Mostra seu desempenho com gráfico\n"
        "• /historico – Lista tudo que você registrou\n"
        "• /editar – Corrige um registro\n"
        "• /excluir – Apaga algo que não quer mais\n"
        "• /filtrar – Busca registros específicos\n"
        "• /buscapotenciais – Encontra novos clientes\n"
        "• /criarrota – Cria uma rota otimizada\n"
        "• /quemvisitar – Sugere clientes pra hoje\n\n"
        "Se precisar sair de um comando, é só usar /cancelar. Bora vender? 🚀"
    )
    try:
        await update.message.reply_text(msg, parse_mode="Markdown")
    except Exception as e:
        logger.error("Erro ao executar /ajuda: %s", e)

async def quem_visitar(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = str(update.message.chat.id)
    hoje = datetime.now(TIMEZONE).date().isoformat()
    try:
        followups = list(db.collection("users").document(chat_id).collection("followups")
                        .where("data_follow", "==", hoje)
                        .where("status", "==", "pendente").limit(10).stream())
        if not followups:
            await update.message.reply_text("🌟 Hoje tá tranquilo, parceiro! Nenhum follow-up pendente. Que tal prospectar com /buscapotenciais?")
            return
        
        msg = "📅 *Quem visitar hoje:*\n"
        options = []
        for i, doc in enumerate(followups, 1):
            data = doc.to_dict()
            data_follow = data.get('data_follow', hoje)
            try:
                data_fmt = datetime.fromisoformat(data_follow).strftime("%d/%m/%Y")
            except (ValueError, TypeError):
                data_fmt = data_follow
            descricao = data.get('descricao', 'Sem descrição')
            if len(descricao) > 100:
                descricao = descricao[:100] + "..."
            msg += f"{i}. *{data.get('cliente', 'Sem cliente')}* - {data_fmt} - {descricao}\n"
            options.append([InlineKeyboardButton(f"Marcar Follow up #{i} como feito", callback_data=f"quemvisitar_done:{doc.id}")])
        
        reply_markup = InlineKeyboardMarkup(options)
        await update.message.reply_text(msg, parse_mode="Markdown", reply_markup=reply_markup)
    except Exception as e:
        logger.error("Erro ao executar /quemvisitar: %s", e)
        await update.message.reply_text("😅 Deu um erro ao listar os follow-ups. Tenta de novo?")

async def quem_visitar_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    doc_id = query.data.split(":", 1)[1]
    chat_id = str(query.message.chat.id)
    try:
        db.collection("users").document(chat_id).collection("followups").document(doc_id).update({"status": "realizado"})
        await query.edit_message_text(f"✅ *Follow-up marcado como feito!* Boa, parceiro!", parse_mode="Markdown")
    except Exception as e:
        logger.error("Erro ao marcar follow-up como feito: %s", e)
        await query.edit_message_text("😅 Deu um erro ao atualizar. Tenta de novo?")