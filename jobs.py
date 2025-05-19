import logging
from telegram.ext import ContextTypes
from telegram import Update
from datetime import datetime, time
from config import TIMEZONE, logger
from database import db
import asyncio
from google.cloud.firestore_v1 import FieldFilter

# Função para obter o número da semana
def get_week_number(date: datetime) -> int:
    return date.isocalendar()[1]

async def lembrete_diario(context: ContextTypes.DEFAULT_TYPE) -> None:
    """Envia lembretes diários às 7h30, 12h30 e 17h30."""
    now = datetime.now(TIMEZONE)
    target_times = [
        time(hour=7, minute=30, tzinfo=TIMEZONE),
        time(hour=12, minute=30, tzinfo=TIMEZONE),
        time(hour=17, minute=30, tzinfo=TIMEZONE),
    ]
    
    if now.time().replace(second=0, microsecond=0) in target_times:
        logger.info("Enviando lembrete diário às %s", now.strftime("%H:%M"))
        users = list(db.collection("users").limit(50).stream())
        if not users:
            logger.warning("Nenhum usuário encontrado na coleção 'users'")
            return
        
        for user in users:
            chat_id = user.id
            pendentes = []
            atrasados = []
            concluidos = []
            try:
                followups = list(
                    db.collection("users")
                    .document(chat_id)
                    .collection("followups")
                    .stream()
                )
                for followup in followups:
                    data = followup.to_dict()
                    data_follow = datetime.strptime(
                        data["data_follow"], "%Y-%m-%d"
                    ).date()
                    status = data.get("status", "pendente")
                    if status == "pendente" and data_follow == now.date():
                        pendentes.append(data)
                    elif status == "pendente" and data_follow < now.date():
                        atrasados.append(data)
                    elif status == "concluido":
                        concluidos.append(data)
            except Exception as e:
                logger.error("Erro ao buscar follow-ups para chat_id %s: %s", chat_id, e)
                continue
            
            message = f"📋 *Resumo do dia {now.strftime('%d/%m/%Y')}*\n\n"
            if pendentes:
                message += "*Follow-ups pendentes hoje:*\n"
                for p in pendentes:
                    message += f"- {p['cliente']}: {p['descricao']} às {p['data_follow']}\n"
            else:
                message += "*Nenhum follow-up pendente hoje.*\n"
                
            if atrasados:
                message += "\n*Follow-ups atrasados:*\n"
                for a in atrasados:
                    message += f"- {a['cliente']}: {a['descricao']} ({a['data_follow']})\n"
            
            if concluidos:
                message += "\n*Follow-ups concluídos:*\n"
                for c in concluidos:
                    message += f"- {c['cliente']}: {c['descricao']}\n"
            
            try:
                await context.bot.send_message(
                    chat_id=chat_id, text=message, parse_mode="Markdown"
                )
                logger.info("Lembrete diário enviado para chat_id %s", chat_id)
            except Exception as e:
                logger.error("Erro ao enviar lembrete diário para chat_id %s: %s", chat_id, e)
            await asyncio.sleep(0.5)

async def lembrete_semanal(context: ContextTypes.DEFAULT_TYPE) -> None:
    """Envia resumo semanal às segundas e sextas."""
    now = datetime.now(TIMEZONE)
    if now.weekday() not in [0, 4]:
        return
    
    logger.info("Enviando lembrete semanal às %s", now.strftime("%H:%M"))
    users = list(db.collection("users").limit(50).stream())
    if not users:
        logger.warning("Nenhum usuário encontrado na coleção 'users'")
        return
    
    for user in users:
        chat_id = user.id
        semana_atual = get_week_number(now)
        visitas = []
        followups_pendentes = []
        try:
            visitas_docs = list(
                db.collection("users")
                .document(chat_id)
                .collection("visitas")
                .where("timestamp", ">=", datetime(now.year, now.month, now.day).timestamp())
                .stream()
            )
            for visita in visitas_docs:
                data = visita.to_dict()
                data_visita = datetime.strptime(
                    data["data_visita"], "%Y-%m-%d"
                ).date()
                if get_week_number(data_visita) == semana_atual:
                    visitas.append(data)
            
            followups = list(
                db.collection("users")
                .document(chat_id)
                .collection("followups")
                .where("status", "==", "pendente")
                .stream()
            )
            for followup in followups:
                data = followup.to_dict()
                data_follow = datetime.strptime(
                    data["data_follow"], "%Y-%m-%d"
                ).date()
                if get_week_number(data_follow) == semana_atual:
                    followups_pendentes.append(data)
        except Exception as e:
            logger.error("Erro ao buscar dados para chat_id %s: %s", chat_id, e)
            continue
        
        message = f"📅 *Resumo da semana {semana_atual} ({now.strftime('%d/%m/%Y')})*\n\n"
        if now.weekday() == 0:
            message += "*Planejamento da semana:*\n"
        else:
            message += "*Resumo da semana:*\n"
            
        if visitas:
            message += "*Visitas realizadas:*\n"
            for v in visitas:
                message += f"- {v['empresa']}: {v['motivo']} ({v['data_visita']})\n"
        else:
            message += "*Nenhuma visita registrada.*\n"
            
        if followups_pendentes:
            message += "\n*Follow-ups pendentes:*\n"
            for f in followups_pendentes:
                message += f"- {f['cliente']}: {f['descricao']} ({f['data_follow']})\n"
        else:
            message += "\n*Nenhum follow-up pendente.*\n"
            
        try:
            await context.bot.send_message(
                chat_id=chat_id, text=message, parse_mode="Markdown"
            )
            logger.info("Lembrete semanal enviado para chat_id %s", chat_id)
        except Exception as e:
            logger.error("Erro ao enviar lembrete semanal para chat_id %s: %s", chat_id, e)
        await asyncio.sleep(0.5)

async def enviar_lembrete(context: ContextTypes.DEFAULT_TYPE) -> None:
    """Envia um lembrete agendado e atualiza o status no Firebase."""
    job = context.job
    chat_id = job.data["chat_id"]
    texto = job.data["texto"]
    lembrete_id = job.data["lembrete_id"]
    
    logger.info("Executando job para enviar lembrete para chat_id %s: %s (lembrete_id: %s)", 
                chat_id, texto, lembrete_id)
    try:
        # Enviar mensagem
        await context.bot.send_message(
            chat_id=chat_id,
            text=f"⏰ Lembrete: {texto}",
            parse_mode="Markdown"
        )
        logger.debug("Mensagem enviada para chat_id %s", chat_id)
        
        # Atualizar status no Firebase
        db.collection("users").document(chat_id).collection("lembretes").document(lembrete_id).update({"status": "enviado"})
        logger.debug("Status atualizado para 'enviado' no Firebase (lembrete_id: %s)", lembrete_id)
        
        logger.info("Lembrete enviado e status atualizado para chat_id %s: %s", chat_id, texto)
    except Exception as e:
        logger.error("Erro ao enviar lembrete ou atualizar status para chat_id %s (lembrete_id: %s): %s", 
                    chat_id, lembrete_id, e)