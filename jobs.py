import asyncio
from datetime import datetime, timedelta
from config import logger, TIMEZONE
from database import db  # Importamos db de database.py
from telegram.error import BadRequest, NetworkError, TimedOut

async def lembrete_diario(context, force_hour=None, force_minute=None):
    now = datetime.now(TIMEZONE)
    hoje = now.date().isoformat()
    logger.info("Iniciando lembrete_diario às %s (force_hour=%s, force_minute=%s)", 
                now.strftime("%H:%M:%S"), force_hour, force_minute)
    try:
        users = list(db.collection("users").limit(50).stream())
        logger.info("Encontrados %d usuários na coleção 'users'", len(users))
        
        if not users:
            logger.warning("Nenhum usuário encontrado na coleção 'users'")
            return
        
        for user in users:
            chat_id = user.id
            logger.info("Processando usuário %s", chat_id)
            try:
                followups_hoje = list(db.collection("users").document(chat_id).collection("followups")
                                     .where("data_follow", "==", hoje)
                                     .where("status", "==", "pendente").limit(10).stream())
                followups_atrasados = list(db.collection("users").document(chat_id).collection("followups")
                                          .where("data_follow", "<", hoje)
                                          .where("status", "in", ["pendente", "atrasado"]).limit(10).stream())
                realizados = list(db.collection("users").document(chat_id).collection("followups")
                                 .where("data_follow", "==", hoje)
                                 .where("status", "==", "realizado").limit(10).stream())

                pendentes_hoje = [f for f in followups_hoje]
                pendentes_atrasados = [f for f in followups_atrasados]
                logger.info("Encontrados %d pendentes hoje, %d atrasados, %d realizados para %s", 
                            len(pendentes_hoje), len(pendentes_atrasados), len(realizados), chat_id)

                msg = None
                reply_markup = None
                check_hour = force_hour if force_hour is not None else now.hour
                check_minute = force_minute if force_minute is not None else now.minute

                if check_hour == 7 and check_minute == 30:
                    msg = "☀️ *Bom dia, parceiro!* Aqui vai o resumo de follow-ups:\n"
                    if pendentes_hoje:
                        msg += "\n📅 *Follow Ups pendentes para hoje*:\n"
                        for i, f in enumerate(pendentes_hoje[:5], 1):
                            data = f.to_dict()
                            msg += f"{i}. *{data.get('cliente', 'Sem cliente')}* - {data.get('descricao', 'Sem descrição')[:50]}...\n"
                    else:
                        msg += "\n📅 *Nenhum follow-up pendente para hoje!*"
                    if pendentes_atrasados:
                        msg += f"\n⚠️ Você tem {len(pendentes_atrasados)} follow-ups atrasados! Use /atrasados para resolver."
                    if pendentes_hoje:
                        options = [[InlineKeyboardButton(f"Marcar Follow Up #{i} concluído", callback_data=f"daily_done:{f.id}")]
                                  for i, f in enumerate(pendentes_hoje[:5], 1)]
                        reply_markup = InlineKeyboardMarkup(options)
                
                elif check_hour == 12 and check_minute == 30:
                    msg = "🍲 *Tarde na área!* Aqui vai o resumo de follow-ups do dia:\n"
                    if pendentes_hoje:
                        msg += "\n📅 *Follow Ups pendentes para hoje*:\n"
                        for i, f in enumerate(pendentes_hoje[:5], 1):
                            data = f.to_dict()
                            msg += f"{i}. *{data.get('cliente', 'Sem cliente')}* - {data.get('descricao', 'Sem descrição')[:50]}...\n"
                    else:
                        msg += "\n📅 *Nenhum follow-up pendente para hoje!*"
                    if pendentes_atrasados:
                        msg += f"\n⚠️ Você ainda possui {len(pendentes_atrasados)} follow-ups atrasados! Use /atrasados para resolver."
                    if pendentes_hoje:
                        options = [[InlineKeyboardButton(f"Marcar Follow Up #{i} concluído", callback_data=f"daily_done:{f.id}")]
                                  for i, f in enumerate(pendentes_hoje[:5], 1)]
                        reply_markup = InlineKeyboardMarkup(options)
                
                elif check_hour == 17 and check_minute == 30:
                    visitas = list(db.collection("users").document(chat_id).collection("visitas")
                                  .where("data_visita", "==", hoje).limit(10).stream())
                    interacoes = list(db.collection("users").document(chat_id).collection("interacoes")
                                     .where("criado_em", ">=", hoje).limit(10).stream())
                    msg = "🌅 *Fim de expediente!* Resumo do dia:\n"
                    msg += f"📋 Follow-ups: {len(realizados)} feitos, {len(pendentes_hoje)} pendentes\n"
                    msg += f"🏢 Visitas: {len(visitas)}\n"
                    msg += f"💬 Interações: {len(interacoes)}\n"
                    if pendentes_hoje:
                        msg += "\n📅 *Follow Ups pendentes para hoje*:\n"
                        for i, f in enumerate(pendentes_hoje[:5], 1):
                            data = f.to_dict()
                            msg += f"{i}. *{data.get('cliente', 'Sem cliente')}* - {data.get('descricao', 'Sem descrição')[:50]}...\n"
                    else:
                        msg += "\n📅 *Nenhum follow-up pendente para hoje!*"
                    if pendentes_atrasados:
                        msg += f"\n⚠️ Você ainda possui {len(pendentes_atrasados)} follow-ups atrasados! Use /atrasados para resolver."
                    if pendentes_hoje:
                        options = [[InlineKeyboardButton(f"Marcar Follow Up #{i} concluído", callback_data=f"daily_done:{f.id}")]
                                  for i, f in enumerate(pendentes_hoje[:5], 1)]
                        reply_markup = InlineKeyboardMarkup(options)
                
                else:
                    logger.info("Horário %s:%s não configurado para envio, ignorando", check_hour, check_minute)
                    continue

                if msg:
                    if len(msg) > 4000:
                        msg = msg[:4000] + "..."
                    logger.info("Enviando lembrete para chat_id %s: %s", chat_id, msg[:50] + "...")
                    await context.bot.send_message(chat_id, msg, parse_mode="Markdown", reply_markup=reply_markup)
                else:
                    logger.info("Nenhuma mensagem gerada para chat_id %s", chat_id)
                
                await asyncio.sleep(0.5)
            except (BadRequest, NetworkError, TimedOut) as e:
                logger.error("Erro ao enviar lembrete diário para %s: %s", chat_id, e)
            except Exception as e:
                logger.error("Erro ao processar lembrete diário para %s: %s", chat_id, e)
    except Exception as e:
        logger.error("Erro geral no lembrete diário: %s", e)

async def lembrete_semanal(context):
    now = datetime.now(TIMEZONE)
    hoje = now.date()
    inicio_semana_atual = hoje - timedelta(days=hoje.weekday())
    fim_semana_atual = inicio_semana_atual + timedelta(days=6)
    inicio_proxima_semana = fim_semana_atual + timedelta(days=1)
    fim_proxima_semana = inicio_proxima_semana + timedelta(days=6)
    
    dia_da_semana = hoje.weekday()
    if not ((dia_da_semana == 4 and now.hour == 19) or (dia_da_semana == 0 and now.hour == 7)):
        return
    
    try:
        users = db.collection("users").limit(50).stream()
        for user in users:
            chat_id = user.id
            try:
                if dia_da_semana == 4:
                    followups = list(db.collection("users").document(chat_id).collection("followups")
                                    .where("data_follow", ">=", inicio_semana_atual.isoformat())
                                    .where("data_follow", "<=", fim_semana_atual.isoformat()).limit(10).stream())
                    msg = "📅 *Resumo da semana atual* (segunda a domingo):\n"
                    realizados = [f for f in followups if f.to_dict().get("status") == "realizado"]
                    pendentes = [f for f in followups if f.to_dict().get("status") == "pendente"]
                    msg += f"📋 Follow-ups: {len(realizados)} feitos, {len(pendentes)} pendentes\n"
                    if pendentes:
                        msg += "\nPendentes da semana:\n"
                        for i, f in enumerate(pendentes[:5], 1):
                            data = f.to_dict()
                            data_follow = datetime.fromisoformat(data.get('data_follow', hoje.isoformat())).strftime("%d/%m/%Y")
                            msg += f"{i}. *{data.get('cliente', 'Sem cliente')}* - {data_follow}\n"
                    await context.bot.send_message(chat_id, msg, parse_mode="Markdown")

                elif dia_da_semana == 0:
                    followups = list(db.collection("users").document(chat_id).collection("followups")
                                    .where("data_follow", ">=", inicio_proxima_semana.isoformat())
                                    .where("data_follow", "<=", fim_proxima_semana.isoformat()).limit(10).stream())
                    msg = "📅 *Semana chegando!* Aqui vai o que tá planejado:\n"
                    if followups:
                        for i, f in enumerate(followups[:5], 1):
                            data = f.to_dict()
                            data_follow = datetime.fromisoformat(data.get('data_follow', hoje.isoformat())).strftime("%d/%m/%Y")
                            msg += f"{i}. *{data.get('cliente', 'Sem cliente')}* - {data_follow} ({data.get('status', 'Sem status')})\n"
                    else:
                        msg += "🌟 Tá livre essa semana! Que tal planejar com /followup ou /buscapotenciais?"
                    await context.bot.send_message(chat_id, msg, parse_mode="Markdown")
                
                await asyncio.sleep(0.5)
            except (BadRequest, NetworkError, TimedOut) as e:
                logger.error("Erro ao enviar lembrete semanal para %s: %s", chat_id, e)
            except Exception as e:
                logger.error("Erro ao processar lembrete semanal para %s: %s", chat_id, e)
    except Exception as e:
        logger.error("Erro geral no lembrete semanal: %s", e)

async def marcar_atrasados(context):
    now = datetime.now(TIMEZONE)
    hoje = now.date().isoformat()
    logger.info("Iniciando marcar_atrasados às %s", now.strftime("%H:%M:%S"))
    try:
        users = list(db.collection("users").limit(50).stream())
        logger.info("Encontrados %d usuários na coleção 'users'", len(users))
        
        if not users:
            logger.warning("Nenhum usuário encontrado na coleção 'users'")
            return
        
        for user in users:
            chat_id = user.id
            logger.info("Processando usuário %s", chat_id)
            try:
                followups_hoje = list(db.collection("users").document(chat_id).collection("followups")
                                     .where("data_follow", "==", hoje)
                                     .where("status", "==", "pendente").stream())
                
                for f in followups_hoje:
                    f.reference.update({"status": "atrasado"})
                    logger.info("Follow-up %s de chat_id %s marcado como atrasado", f.id, chat_id)
                
                logger.info("Processados %d follow-ups pendentes para %s", len(followups_hoje), chat_id)
            except Exception as e:
                logger.error("Erro ao processar atrasados para %s: %s", chat_id, e)
    except Exception as e:
        logger.error("Erro geral no marcar_atrasados: %s", e)