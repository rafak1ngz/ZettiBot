from database import db
from pprint import pprint

chat_id = "1233176656"
categories = ["followups", "visitas", "interacoes"]

for category in categories:
    print(f"\n=== {category} ===")
    docs = list(db.collection("users").document(chat_id).collection(category).stream())
    if not docs:
        print(f"Nenhum documento encontrado em {category}")
    for doc in docs:
        print(f"ID: {doc.id}")
        pprint(doc.to_dict())