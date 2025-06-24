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
  
  // Funções formatadoras
  formatters: {
    // Formatar telefone
    telefone: (value: string): string => {
      if (!value) return '';
      
      // Remover não numéricos
      const cleaned = value.replace(/[^\d]/g, '');
      
      // Aplicar máscara baseado no tamanho
      if (cleaned.length === 11) {
        // Celular: (99) 99999-9999
        return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
      } else if (cleaned.length === 10) {
        // Fixo: (99) 9999-9999
        return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
      } else {
        // Se não for um formato reconhecido
        return value;
      }
    }
  }
};