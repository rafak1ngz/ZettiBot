from telegram import Update
from telegram.ext import ContextTypes
from config import *
from database import db
from datetime import datetime

async def historico_conv_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("📜 Quer rever tudo? Qual a data inicial? (Ex.: 01/04/2025)")
    return HIST_START

async def historico_conv_start_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date_str = update.message.text.strip()
    try:
        start_date_dt = datetime.strptime(date_str, "%d/%m/%Y")
        context.user_data["historico_start"] = date_str
        context.user_data["historico_start_dt"] = start_date_dt
    except ValueError:
        await update.message.reply_text("😅 Data errada! Tenta assim: 01/04/2025")
        return HIST_START
    await update.message.reply_text("📅 E a data final? (Ex.: 20/04/2025)")
    return HIST_END

async def historico_conv_end_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date_str = update.message.text.strip()
    try:
        end_date_dt = datetime.strptime(date_str, "%d/%m/%Y")
        context.user_data["historico_end"] = date_str
        context.user_data["historico_end_dt"] = end_date_dt
    except ValueError:
        await update.message.reply_text("😅 Data errada! Tenta assim: 20/04/2025")
        return HIST_END
    chat_id = str(update.message.chat.id)
    try:
        followups_docs = list(db.collection("users").document(chat_id).collection("followups").stream())
        visitas_docs = list(db.collection("users").document(chat_id).collection("visitas").stream())
        interacoes_docs = list(db.collection("users").document(chat_id).collection("interacoes").stream())
        
        def in_interval(data_str: str, start_dt: datetime, end_dt: datetime) -> bool:
            try:
                doc_date = datetime.fromisoformat(data_str).date()
                return start_dt.date() <= doc_date <= end_dt.date()
            except Exception:
                try:
                    doc_date = datetime.strptime(data_str, "%Y-%m-%d").date()
                    return start_dt.date() <= doc_date <= end_dt.date()
                except Exception:
                    return False
        
        mensagem = f"📜 *Tudo que rolou de {context.user_data['historico_start']} a {context.user_data['historico_end']}*\n\n"
        
        # Follow-ups
        followups_filtrados = []
        for doc in followups_docs:
            data = doc.to_dict() or {}
            data_follow = data.get("data_follow", "")
            if data_follow and in_interval(data_follow, context.user_data["historico_start_dt"], context.user_data["historico_end_dt"]):
                followups_filtrados.append((doc, data))
        
        if followups_filtrados:
            mensagem += "📋 *Follow-ups*\n"
            for doc, data in followups_filtrados:
                data_follow = data.get("data_follow", "Sem data")
                try:
                    data_fmt = datetime.fromisoformat(data_follow).strftime("%d/%m/%Y")
                except:
                    try:
                        data_fmt = datetime.strptime(data_follow, "%Y-%m-%d").strftime("%d/%m/%Y")
                    except:
                        data_fmt = data_follow
                mensagem += f"• {data.get('cliente', 'Sem cliente')}, {data_fmt}, {data.get('status', 'Sem status')}\n"
        else:
            mensagem += "📋 *Follow-ups*: Nada registrado.\n"
        
        # Visitas
        visitas_filtradas = []
        for doc in visitas_docs:
            data = doc.to_dict() or {}
            data_visita = data.get("data_visita", "")
            if data_visita and in_interval(data_visita, context.user_data["historico_start_dt"], context.user_data["historico_end_dt"]):
                visitas_filtradas.append((doc, data))
        
        if visitas_filtradas:
            mensagem += "\n🏢 *Visitas*\n"
            for doc, data in visitas_filtradas:
                data_visita = data.get("data_visita", "Sem data")
                try:
                    data_fmt = datetime.fromisoformat(data_visita).strftime("%d/%m/%Y")
                except:
                    try:
                        data_fmt = datetime.strptime(data_visita, "%Y-%m-%d").strftime("%d/%m/%Y")
                    except:
                        data_fmt = data_visita
                mensagem += f"• {data.get('empresa', 'Sem empresa')}, {data_fmt}, {data.get('classificacao', 'Sem classificação')}\n"
        else:
            mensagem += "\n🏢 *Visitas*: Nada registrado.\n"
        
        # Interações
        interacoes_filtradas = []
        for doc in interacoes_docs:
            data = doc.to_dict() or {}
            criado_em = data.get("criado_em", "")
            if criado_em and in_interval(criado_em, context.user_data["historico_start_dt"], context.user_data["historico_end_dt"]):
                interacoes_filtradas.append((doc, data))
        
        if interacoes_filtradas:
            mensagem += "\n💬 *Interações*\n"
            for doc, data in interacoes_filtradas:
                criado_em = data.get("criado_em", "Sem data")
                try:
                    data_fmt = datetime.fromisoformat(criado_em).strftime("%d/%m/%Y")
                except:
                    try:
                        data_fmt = datetime.strptime(criado_em, "%Y-%m-%d").strftime("%d/%m/%Y")
                    except:
                        data_fmt = criado_em
                mensagem += f"• {data.get('cliente', 'Sem cliente')}, {data.get('resumo', 'Sem resumo')[:50]}... ({data_fmt})\n"
        else:
            mensagem += "\n💬 *Interações*: Nada registrado.\n"
        
        if mensagem.strip() == f"📜 *Tudo que rolou de {context.user_data['historico_start']} a {context.user_data['historico_end']}*\n\n📋 *Follow-ups*: Nada registrado.\n🏢 *Visitas*: Nada registrado.\n💬 *Interações*: Nada registrado.\n":
            mensagem = "😕 Não achei nada nesse período. Tenta outras datas?"
        
        await update.message.reply_text(mensagem, parse_mode="Markdown")
    except Exception as e:
        logger.error("Erro ao gerar histórico: %s", e)
        await update.message.reply_text("😅 Deu um erro ao buscar o histórico. Tenta de novo?")
    return ConversationHandler.END

async def historico_conv_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("📜 Beleza, histórico cancelado!")
    return ConversationHandler.END