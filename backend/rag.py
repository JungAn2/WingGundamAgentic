import chromadb
from chromadb.config import Settings
import os

class RAGSystem:
    def __init__(self, persist_directory="./rag_storage"):
        self.client = chromadb.PersistentClient(path=persist_directory)
        self.collection = self.client.get_or_create_collection(name="wing_gundam_knowledge")

    def add_document(self, doc_id, text, metadata=None):
        if metadata is None:
            metadata = {}
        self.collection.add(
            documents=[text],
            metadatas=[metadata],
            ids=[doc_id]
        )

    def query(self, query_text, n_results=3):
        results = self.collection.query(
            query_texts=[query_text],
            n_results=n_results
        )
        return results

rag_system = RAGSystem()
