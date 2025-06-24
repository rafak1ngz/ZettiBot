// src/utils/validators.ts
export const validators = {
  // Validação básica de CNPJ
  cnpj: (value: string): boolean => {
    if (!value) return true; // Aceitar vazio

    // Remover caracteres não numéricos
    const cleaned = value.replace(/[^\d]/g, '');
    
    // Verificar tamanho
    if (cleaned.length !== 14) return false;
    
    // Verificar se todos os dígitos são iguais
    if (/^(\d)\1+$/.test(cleaned)) return false;
    
    // Validação simplificada
    return true; // Implementar algoritmo completo se necessário
  },
  
  // Validação básica de telefone
  telefone: (value: string): boolean => {
    if (!value) return true; // Aceitar vazio
    
    // Remover caracteres não numéricos
    const cleaned = value.replace(/[^\d]/g, '');
    
    // Verificar tamanho (assumindo formato brasileiro)
    return cleaned.length >= 10 && cleaned.length <= 11;
  },
  
  // Validação de email
  email: (value: string): boolean => {
    if (!value) return true; // Aceitar vazio
    
    // Expressão regular simples para validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  }
};