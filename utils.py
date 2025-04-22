import matplotlib.pyplot as plt
import csv
import tempfile
from config import logger

# Função para gerar gráfico
def gerar_grafico(total_followups, confirmados, pendentes, total_visitas, total_interacoes, periodo_info):
    try:
        plt.figure(figsize=(8, 4))
        categorias = ['Follow-ups', 'Confirmados', 'Pendentes', 'Visitas', 'Interações']
        valores = [total_followups, confirmados, pendentes, total_visitas, total_interacoes]
        barras = plt.bar(categorias, valores, color=['#007BFF', '#66B2FF', '#D9D9D9', '#FF6F61', '#FFD700'])
        plt.title(f"Resumo {periodo_info}", fontfamily='Montserrat', fontsize=14, fontweight='bold')
        for barra in barras:
            yval = barra.get_height()
            plt.text(barra.get_x() + barra.get_width() / 2, yval + 0.1, yval, ha='center', va='bottom', fontfamily='Roboto')
        tmp_file = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        plt.savefig(tmp_file.name, dpi=150, bbox_inches='tight')
        plt.close()
        logger.info("Gráfico gerado com sucesso: %s", tmp_file.name)
        return tmp_file.name
    except Exception as e:
        logger.error("Erro ao gerar gráfico: %s", e)
        raise

# Função para exportar CSV
def exportar_csv(docs):
    try:
        temp_file = tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="", delete=False, suffix=".csv")
        writer = csv.writer(temp_file)
        if docs:
            keys = list(docs[0].to_dict().keys())
            writer.writerow(keys)
            for doc in docs:
                data = doc.to_dict()
                writer.writerow([data.get(k, "") for k in keys])
        temp_file.close()
        logger.info("CSV exportado com sucesso: %s", temp_file.name)
        return temp_file.name
    except Exception as e:
        logger.error("Erro ao exportar CSV: %s", e)
        raise