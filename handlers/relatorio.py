import logging
import matplotlib.pyplot as plt
import pandas as pd
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes, ConversationHandler, CommandHandler, CallbackQueryHandler, MessageHandler, filters
from datetime import datetime
from config import TIMEZONE
from database import db
import io
import os

# Logger
logger = logging.getLogger(__name__)

# Estados da conversa
REPORT_CATEGORY, REPORT_PERIOD = range(2)

async def relatorio_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Inicia o comando /relatorio."""
    chat_id = update.effective_chat.id
    logger.info("Iniciando /relatorio para chat_id %s", chat_id)
    try:
        keyboard = [
            [InlineKeyboardButton("📋 Contratos", callback_data="categoria_contratos")],
            [InlineKeyboardButton("🏢 Visitas", callback_data="categoria_visitas")],
            [InlineKeyboardButton("📞 Follow-ups", callback_data="categoria_followups")],
            [InlineKeyboardButton("🔔 Lembretes", callback_data="categoria_lembretes")],
            [InlineKeyboardButton("✅ Tarefas", callback_data="categoria_tarefas")],
            [InlineKeyboardButton("💼 Propostas", callback_data="categoria_propostas")],
            [InlineKeyboardButton("💸 Despesas", callback_data="categoria_despesas")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text(
            "📊 Escolha a categoria do relatório:",
            reply_markup=reply_markup,
            parse_mode="Markdown"
        )
        logger.debug("Menu de categorias enviado para chat_id %s", chat_id)
        return REPORT_CATEGORY
    except Exception as e:
        logger.error("Erro ao iniciar /relatorio para chat_id %s: %s", chat_id, e)
        return ConversationHandler.END

async def relatorio_category(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Processa a escolha da categoria."""
    query = update.callback_query
    await query.answer()
    chat_id = str(query.message.chat_id)
    category = query.data.split("_")[1]
    logger.info("Categoria selecionada para chat_id %s: %s", chat_id, category)
    context.user_data["relatorio_categoria"] = category
    await query.message.reply_text(
        "📅 Qual o período do relatório? (Ex.: 01/04/2025 a 30/04/2025)",
        parse_mode="Markdown"
    )
    return REPORT_PERIOD

async def relatorio_period(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Recebe o período e gera o relatório para a categoria escolhida."""
    chat_id = update.effective_chat.id
    period_text = update.message.text.strip()
    logger.info("Período recebido para chat_id %s: %s", chat_id, period_text)
    category = context.user_data.get("relatorio_categoria", "contratos")
    try:
        if " a " not in period_text:
            raise ValueError("Formato inválido: use 'DD/MM/YYYY a DD/MM/YYYY'")
        start_str, end_str = period_text.split(" a ")
        start_date = datetime.strptime(start_str.strip(), "%d/%m/%Y").replace(tzinfo=TIMEZONE)
        end_date = datetime.strptime(end_str.strip(), "%d/%m/%Y").replace(tzinfo=TIMEZONE)
        
        if start_date > end_date:
            logger.warning("Período inválido para chat_id %s: início após fim", chat_id)
            await update.message.reply_text(
                "❌ A data inicial deve ser antes da final. Tente novamente.",
                parse_mode="Markdown"
            )
            return REPORT_PERIOD
        
        if category == "contratos":
            message, img_path, excel_path = await gerar_relatorio_contratos(str(chat_id), start_date, end_date)
        elif category == "visitas":
            message, img_path, excel_path = await gerar_relatorio_visitas(str(chat_id), start_date, end_date)
        elif category == "followups":
            message, img_path, excel_path = await gerar_relatorio_followups(str(chat_id), start_date, end_date)
        elif category == "lembretes":
            message, img_path, excel_path = await gerar_relatorio_lembretes(str(chat_id), start_date, end_date)
        elif category == "tarefas":
            message, img_path, excel_path = await gerar_relatorio_tarefas(str(chat_id), start_date, end_date)
        elif category == "propostas":
            message, img_path, excel_path = await gerar_relatorio_propostas(str(chat_id), start_date, end_date)
        elif category == "despesas":
            message, img_path, excel_path = await gerar_relatorio_despesas(str(chat_id), start_date, end_date)
        else:
            message = "❌ Categoria inválida."
            img_path = excel_path = None
        
        # Enviar mensagem de texto
        await update.message.reply_text(message, parse_mode="Markdown")
        
        # Enviar imagem, se gerada
        if img_path:
            with open(img_path, 'rb') as img_file:
                await update.message.reply_photo(photo=img_file, caption="Gráfico do relatório")
            os.remove(img_path)  # Remove o arquivo temporário
        
        # Enviar Excel, se gerado
        if excel_path:
            with open(excel_path, 'rb') as excel_file:
                await update.message.reply_document(document=excel_file, caption="Relatório em Excel")
            os.remove(excel_path)  # Remove o arquivo temporário
        
        return ConversationHandler.END
    except ValueError as e:
        logger.warning("Formato de período inválido para chat_id %s: %s", chat_id, str(e))
        await update.message.reply_text(
            "❌ Use o formato DD/MM/YYYY a DD/MM/YYYY, como 01/04/2025 a 30/04/2025.",
            parse_mode="Markdown"
        )
        return REPORT_PERIOD
    except Exception as e:
        logger.error("Erro ao gerar relatório para chat_id %s: %s", chat_id, e)
        await update.message.reply_text(
            "❌ Algo deu errado. Tente de novo.",
            parse_mode="Markdown"
        )
        return ConversationHandler.END

async def gerar_relatorio_contratos(chat_id: str, start_date: datetime, end_date: datetime) -> tuple:
    """Gera o relatório de contratos, imagem e Excel."""
    try:
        contratos = list(db.collection("users").document(chat_id).collection("contratos").stream())
        total_registrados = len(contratos)
        total_assinados = sum(1 for c in contratos if c.to_dict().get("status") == "concluido")
        total_pendentes = sum(1 for c in contratos if c.to_dict().get("status") == "pendente")
        
        contratos_vencendo = []
        excel_data = []
        for c in contratos:
            data = c.to_dict()
            if data.get("status") == "concluido" and "data_vencimento" in data:
                try:
                    data_vencimento = datetime.fromisoformat(data["data_vencimento"]).replace(tzinfo=TIMEZONE)
                    if start_date <= data_vencimento <= end_date:
                        contratos_vencendo.append(data)
                except (ValueError, TypeError) as e:
                    logger.warning("Erro ao processar data_vencimento para contrato %s: %s", c.id, e)
                    continue
            excel_data.append({
                "Cliente": str(data.get("cliente", "Desconhecido")),
                "Status": str(data.get("status", "Desconhecido")),
                "Data Vencimento": data.get("data_vencimento", "")
            })
        
        # Mensagem de texto
        message = "📋 Relatório de Contratos\n\n"
        message += f"• Total de contratos registrados: {total_registrados}\n"
        message += f"• Contratos assinados: {total_assinados}\n"
        message += f"• Contratos pendentes: {total_pendentes}\n"
        
        if contratos_vencendo:
            message += "\n🔴 Contratos próximos do vencimento:\n"
            for contrato in contratos_vencendo:
                cliente = str(contrato.get("cliente", "Desconhecido"))
                data_vencimento = datetime.fromisoformat(contrato["data_vencimento"]).strftime('%d/%m/%Y')
                logger.debug("Processando contrato vencendo: cliente=%s, data_vencimento=%s", cliente, data_vencimento)
                message += f"• {cliente}: Vence em {data_vencimento}\n"
        else:
            message += "\n✅ Nenhum contrato próximo do vencimento.\n"
        
        # Gerar imagem
        img_path = None
        if total_registrados > 0:
            fig, ax = plt.subplots()
            labels = ["Assinados", "Pendentes"]
            sizes = [total_assinados, total_pendentes]
            ax.pie(sizes, labels=labels, autopct='%1.1f%%', startangle=90)
            ax.axis('equal')
            img_path = f"relatorio_contratos_{chat_id}.png"
            plt.savefig(img_path)
            plt.close()
        
        # Gerar Excel
        excel_path = None
        if excel_data:
            df = pd.DataFrame(excel_data)
            excel_path = f"relatorio_contratos_{chat_id}.xlsx"
            df.to_excel(excel_path, index=False)
        
        return message, img_path, excel_path
    except Exception as e:
        logger.error("Erro em gerar_relatorio_contratos para chat_id %s: %s", chat_id, e)
        raise

async def gerar_relatorio_visitas(chat_id: str, start_date: datetime, end_date: datetime) -> tuple:
    """Gera o relatório de visitas, imagem e Excel."""
    try:
        visitas = list(db.collection("users").document(chat_id).collection("visitas").stream())
        visitas_periodo = []
        excel_data = []
        for v in visitas:
            data = v.to_dict()
            try:
                data_visita = datetime.fromisoformat(data["data_visita"]).replace(tzinfo=TIMEZONE)
                if start_date <= data_visita <= end_date:
                    visitas_periodo.append(data)
                excel_data.append({
                    "Empresa": str(data.get("empresa", "Desconhecido")),
                    "Motivo": str(data.get("motivo", "Desconhecido")),
                    "Data Visita": data.get("data_visita", "")
                })
            except (KeyError, ValueError) as e:
                logger.warning("Erro ao processar visita %s: %s", v.id, e)
                continue
        
        total_visitas = len(visitas_periodo)
        clientes = {}
        motivos = {}
        for visita in visitas_periodo:
            cliente = str(visita.get("empresa", "Desconhecido"))
            motivo = str(visita.get("motivo", "Desconhecido"))
            clientes[cliente] = clientes.get(cliente, 0) + 1
            motivos[motivo] = motivos.get(motivo, 0) + 1
        
        # Mensagem de texto
        message = "🏢 Relatório de Visitas\n\n"
        message += f"• Total de visitas no período: {total_visitas}\n"
        message += "\nVisitas por cliente:\n"
        for cliente, count in clientes.items():
            logger.debug("Processando cliente: %s, visitas: %s", cliente, count)
            message += f"• {cliente}: {count} visitas\n"
        message += "\nMotivos mais frequentes:\n"
        for motivo, count in sorted(motivos.items(), key=lambda x: x[1], reverse=True)[:5]:
            logger.debug("Processando motivo: %s, contagem: %s", motivo, count)
            message += f"• {motivo}: {count} visitas\n"
        
        # Gerar imagem
        img_path = None
        if clientes:
            fig, ax = plt.subplots()
            ax.bar(clientes.keys(), clientes.values())
            ax.set_xlabel("Clientes")
            ax.set_ylabel("Número de Visitas")
            ax.set_title("Visitas por Cliente")
            plt.xticks(rotation=45, ha="right")
            plt.tight_layout()
            img_path = f"relatorio_visitas_{chat_id}.png"
            plt.savefig(img_path)
            plt.close()
        
        # Gerar Excel
        excel_path = None
        if excel_data:
            df = pd.DataFrame(excel_data)
            excel_path = f"relatorio_visitas_{chat_id}.xlsx"
            df.to_excel(excel_path, index=False)
        
        return message, img_path, excel_path
    except Exception as e:
        logger.error("Erro em gerar_relatorio_visitas para chat_id %s: %s", chat_id, e)
        raise

async def gerar_relatorio_followups(chat_id: str, start_date: datetime, end_date: datetime) -> tuple:
    """Gera o relatório de follow-ups, imagem e Excel."""
    try:
        followups = list(db.collection("users").document(chat_id).collection("followups").stream())
        followups_periodo = []
        excel_data = []
        for f in followups:
            data = f.to_dict()
            try:
                data_follow = datetime.fromisoformat(data["data_follow"]).replace(tzinfo=TIMEZONE)
                if start_date <= data_follow <= end_date:
                    followups_periodo.append(data)
                excel_data.append({
                    "Cliente": str(data.get("cliente", "Desconhecido")),
                    "Status": str(data.get("status", "Desconhecido")),
                    "Data Follow-up": data.get("data_follow", "")
                })
            except (KeyError, ValueError) as e:
                logger.warning("Erro ao processar follow-up %s: %s", f.id, e)
                continue
        
        total_followups = len(followups_periodo)
        pendentes = sum(1 for f in followups_periodo if f.get("status") == "pendente")
        concluidos = sum(1 for f in followups_periodo if f.get("status") == "concluido")
        
        # Mensagem de texto
        message = "📞 Relatório de Follow-ups\n\n"
        message += f"• Total de follow-ups no período: {total_followups}\n"
        message += f"• Follow-ups pendentes: {pendentes}\n"
        message += f"• Follow-ups concluídos: {concluidos}\n"
        
        # Gerar imagem
        img_path = None
        if total_followups > 0:
            fig, ax = plt.subplots()
            labels = ["Pendentes", "Concluídos"]
            sizes = [pendentes, concluidos]
            ax.pie(sizes, labels=labels, autopct='%1.1f%%', startangle=90)
            ax.axis('equal')
            img_path = f"relatorio_followups_{chat_id}.png"
            plt.savefig(img_path)
            plt.close()
        
        # Gerar Excel
        excel_path = None
        if excel_data:
            df = pd.DataFrame(excel_data)
            excel_path = f"relatorio_followups_{chat_id}.xlsx"
            df.to_excel(excel_path, index=False)
        
        return message, img_path, excel_path
    except Exception as e:
        logger.error("Erro em gerar_relatorio_followups para chat_id %s: %s", chat_id, e)
        raise

async def gerar_relatorio_lembretes(chat_id: str, start_date: datetime, end_date: datetime) -> tuple:
    """Gera o relatório de lembretes, imagem e Excel."""
    try:
        lembretes = list(db.collection("users").document(chat_id).collection("lembretes").stream())
        lembretes_periodo = []
        excel_data = []
        for l in lembretes:
            data = l.to_dict()
            try:
                data_lembrete = datetime.fromisoformat(data["data_hora"]).replace(tzinfo=TIMEZONE)
                if start_date <= data_lembrete <= end_date:
                    lembretes_periodo.append(data)
                excel_data.append({
                    "Texto": str(data.get("texto", "Sem texto")),
                    "Data e Hora": data.get("data_hora", "")
                })
            except (KeyError, ValueError) as e:
                logger.warning("Erro ao processar lembrete %s: %s", l.id, e)
                continue
        
        total_lembretes = len(lembretes_periodo)
        message = "🔔 Relatório de Lembretes\n\n"
        message += f"• Total de lembretes no período: {total_lembretes}\n"
        
        if total_lembretes > 0:
            message += "\nLembretes no período:\n"
            for lembrete in lembretes_periodo:
                texto = str(lembrete.get("texto", "Sem texto"))
                data_hora = datetime.fromisoformat(lembrete["data_hora"]).strftime('%d/%m/%Y %H:%M')
                logger.debug("Processando lembrete: texto=%s, data_hora=%s", texto, data_hora)
                message += f"• {texto} - {data_hora}\n"
        
        # Gerar imagem
        img_path = None
        if total_lembretes > 0:
            fig, ax = plt.subplots()
            ax.bar(["Lembretes"], [total_lembretes])
            ax.set_ylabel("Número de Lembretes")
            ax.set_title("Lembretes no Período")
            plt.tight_layout()
            img_path = f"relatorio_lembretes_{chat_id}.png"
            plt.savefig(img_path)
            plt.close()
        
        # Gerar Excel
        excel_path = None
        if excel_data:
            df = pd.DataFrame(excel_data)
            excel_path = f"relatorio_lembretes_{chat_id}.xlsx"
            df.to_excel(excel_path, index=False)
        
        return message, img_path, excel_path
    except Exception as e:
        logger.error("Erro em gerar_relatorio_lembretes para chat_id %s: %s", chat_id, e)
        raise

async def gerar_relatorio_tarefas(chat_id: str, start_date: datetime, end_date: datetime) -> tuple:
    """Gera o relatório de tarefas, imagem e Excel."""
    try:
        tarefas = list(db.collection("users").document(chat_id).collection("tarefas").stream())
        tarefas_periodo = []
        excel_data = []
        for t in tarefas:
            data = t.to_dict()
            try:
                data_tarefa = datetime.fromisoformat(data["data_prazo"]).replace(tzinfo=TIMEZONE)
                if start_date <= data_tarefa <= end_date:
                    tarefas_periodo.append(data)
                excel_data.append({
                    "Tarefa": str(data.get("tarefa", "Desconhecida")),
                    "Status": str(data.get("status", "Desconhecido")),
                    "Data Prazo": data.get("data_prazo", "")
                })
            except (KeyError, ValueError) as e:
                logger.warning("Erro ao processar tarefa %s: %s", t.id, e)
                continue
        
        total_tarefas = len(tarefas_periodo)
        pendentes = sum(1 for t in tarefas_periodo if t.get("status") == "pendente")
        concluidas = sum(1 for t in tarefas_periodo if t.get("status") == "concluida")
        
        # Mensagem de texto
        message = "✅ Relatório de Tarefas\n\n"
        message += f"• Total de tarefas no período: {total_tarefas}\n"
        message += f"• Tarefas pendentes: {pendentes}\n"
        message += f"• Tarefas concluídas: {concluidas}\n"
        
        # Gerar imagem
        img_path = None
        if total_tarefas > 0:
            fig, ax = plt.subplots()
            labels = ["Pendentes", "Concluídas"]
            sizes = [pendentes, concluidas]
            ax.pie(sizes, labels=labels, autopct='%1.1f%%', startangle=90)
            ax.axis('equal')
            img_path = f"relatorio_tarefas_{chat_id}.png"
            plt.savefig(img_path)
            plt.close()
        
        # Gerar Excel
        excel_path = None
        if excel_data:
            df = pd.DataFrame(excel_data)
            excel_path = f"relatorio_tarefas_{chat_id}.xlsx"
            df.to_excel(excel_path, index=False)
        
        return message, img_path, excel_path
    except Exception as e:
        logger.error("Erro em gerar_relatorio_tarefas para chat_id %s: %s", chat_id, e)
        raise

async def gerar_relatorio_propostas(chat_id: str, start_date: datetime, end_date: datetime) -> tuple:
    """Gera o relatório de propostas, imagem e Excel."""
    try:
        propostas = list(db.collection("users").document(chat_id).collection("propostas").stream())
        propostas_periodo = []
        excel_data = []
        for p in propostas:
            data = p.to_dict()
            try:
                data_proposta = datetime.fromisoformat(data["data_envio"]).replace(tzinfo=TIMEZONE)
                if start_date <= data_proposta <= end_date:
                    propostas_periodo.append(data)
                excel_data.append({
                    "Cliente": str(data.get("cliente", "Desconhecido")),
                    "Status": str(data.get("status", "Desconhecido")),
                    "Valor": float(data.get("valor", 0)),
                    "Data Envio": data.get("data_envio", "")
                })
            except (KeyError, ValueError) as e:
                logger.warning("Erro ao processar proposta %s: %s", p.id, e)
                continue
        
        total_propostas = len(propostas_periodo)
        aceitas = sum(1 for p in propostas_periodo if p.get("status") == "aceita")
        rejeitadas = sum(1 for p in propostas_periodo if p.get("status") == "rejeitada")
        pendentes = sum(1 for p in propostas_periodo if p.get("status") == "pendente")
        valor_total = sum(float(p.get("valor", 0)) for p in propostas_periodo if p.get("status") == "aceita")
        
        # Mensagem de texto
        message = "💼 Relatório de Propostas\n\n"
        message += f"• Total de propostas no período: {total_propostas}\n"
        message += f"• Propostas aceitas: {aceitas}\n"
        message += f"• Propostas rejeitadas: {rejeitadas}\n"
        message += f"• Propostas pendentes: {pendentes}\n"
        message += f"• Valor total de propostas aceitas: R$ {valor_total:.2f}\n"
        
        # Gerar imagem
        img_path = None
        if total_propostas > 0:
            fig, ax = plt.subplots()
            labels = ["Aceitas", "Rejeitadas", "Pendentes"]
            sizes = [aceitas, rejeitadas, pendentes]
            ax.pie(sizes, labels=labels, autopct='%1.1f%%', startangle=90)
            ax.axis('equal')
            img_path = f"relatorio_propostas_{chat_id}.png"
            plt.savefig(img_path)
            plt.close()
        
        # Gerar Excel
        excel_path = None
        if excel_data:
            df = pd.DataFrame(excel_data)
            excel_path = f"relatorio_propostas_{chat_id}.xlsx"
            df.to_excel(excel_path, index=False)
        
        return message, img_path, excel_path
    except Exception as e:
        logger.error("Erro em gerar_relatorio_propostas para chat_id %s: %s", chat_id, e)
        raise

async def gerar_relatorio_despesas(chat_id: str, start_date: datetime, end_date: datetime) -> tuple:
    """Gera o relatório de despesas, imagem e Excel."""
    try:
        despesas = list(db.collection("users").document(chat_id).collection("despesas").stream())
        despesas_periodo = []
        excel_data = []
        for d in despesas:
            data = d.to_dict()
            try:
                data_despesa = datetime.fromisoformat(data["data"]).replace(tzinfo=TIMEZONE)
                if start_date <= data_despesa <= end_date:
                    despesas_periodo.append(data)
                excel_data.append({
                    "Categoria": str(data.get("categoria", "Sem categoria")),
                    "Valor": float(data.get("valor", 0)),
                    "Data": data.get("data", "")
                })
            except (KeyError, ValueError) as e:
                logger.warning("Erro ao processar despesa %s: %s", d.id, e)
                continue
        
        total_despesas = len(despesas_periodo)
        valor_total = sum(float(d.get("valor", 0)) for d in despesas_periodo)
        categorias = {}
        for despesa in despesas_periodo:
            cat = str(despesa.get("categoria", "Sem categoria"))
            valor = float(despesa.get("valor", 0))
            categorias[cat] = categorias.get(cat, 0) + valor
            logger.debug("Processando despesa: categoria=%s, valor=%s", cat, valor)
        
        # Mensagem de texto
        message = "💸 Relatório de Despesas\n\n"
        message += f"• Total de despesas no período: {total_despesas}\n"
        message += f"• Valor total: R$ {valor_total:.2f}\n"
        message += "\nDespesas por categoria:\n"
        for cat, valor in categorias.items():
            logger.debug("Processando categoria: %s, valor: %s", cat, valor)
            message += f"• {cat}: R$ {valor:.2f}\n"
        
        # Gerar imagem
        img_path = None
        if categorias:
            fig, ax = plt.subplots()
            ax.bar(categorias.keys(), categorias.values())
            ax.set_xlabel("Categorias")
            ax.set_ylabel("Valor (R$)")
            ax.set_title("Despesas por Categoria")
            plt.xticks(rotation=45, ha="right")
            plt.tight_layout()
            img_path = f"relatorio_despesas_{chat_id}.png"
            plt.savefig(img_path)
            plt.close()
        
        # Gerar Excel
        excel_path = None
        if excel_data:
            df = pd.DataFrame(excel_data)
            excel_path = f"relatorio_despesas_{chat_id}.xlsx"
            df.to_excel(excel_path, index=False)
        
        return message, img_path, excel_path
    except Exception as e:
        logger.error("Erro em gerar_relatorio_despesas para chat_id %s: %s", chat_id, e)
        raise

async def relatorio_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Cancela a conversa de relatório."""
    chat_id = update.effective_chat.id
    logger.info("Relatório cancelado para chat_id %s", chat_id)
    context.user_data.clear()
    await update.message.reply_text(
        "📝 Beleza, relatório cancelado! Qualquer coisa, é só chamar.",
        parse_mode="Markdown"
    )
    return ConversationHandler.END

def setup_handlers(application):
    """Configura os handlers para o comando /relatorio."""
    logger.info("Configurando handler de /relatorio")
    relatorio_conv = ConversationHandler(
        entry_points=[CommandHandler("relatorio", relatorio_start)],
        states={
            REPORT_CATEGORY: [CallbackQueryHandler(relatorio_category, pattern="^categoria_")],
            REPORT_PERIOD: [MessageHandler(filters.TEXT & ~filters.COMMAND, relatorio_period)],
        },
        fallbacks=[CommandHandler("cancelar", relatorio_cancel)],
        conversation_timeout=300
    )
    application.add_handler(relatorio_conv)
    logger.info("Handler de /relatorio configurado")