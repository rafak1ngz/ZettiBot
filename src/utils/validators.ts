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
  },
  
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
    },
    
    // Nova função para formatar CNPJ
    cnpj: (value: string): string => {
      if (!value) return '';
      
      // Remover caracteres não numéricos
      const cleaned = value.replace(/[^\d]/g, '');
      
      // Verificar se tem 14 dígitos (padrão CNPJ)
      if (cleaned.length !== 14) return value;
      
      // Formatar como: XX.XXX.XXX/XXXX-XX
      return `${cleaned.slice(0, 2)}.${cleaned.slice(2, 5)}.${cleaned.slice(5, 8)}/${cleaned.slice(8, 12)}-${cleaned.slice(12)}`;
    }
  }
}

// ✅ NOVA: Sanitização de texto
export const sanitizers = {
  // Limpar texto de caracteres especiais
  cleanText: (text: string): string => {
    return text.trim().replace(/[<>\"']/g, '');
  },
  
  // Limpar apenas números
  numbersOnly: (text: string): string => {
    return text.replace(/[^\d]/g, '');
  },
  
  // Limpar telefone mantendo apenas números
  cleanPhone: (phone: string): string => {
    const cleaned = phone.replace(/[^\d]/g, '');
    return cleaned.length >= 10 ? cleaned : '';
  }
};

// ✅ MELHORAR: Validação de CNPJ com algoritmo real
export const validarCNPJ = (cnpj: string): boolean => {
  if (!cnpj) return true; // Opcional
  
  const cleaned = cnpj.replace(/[^\d]/g, '');
  if (cleaned.length !== 14) return false;
  if (/^(\d)\1+$/.test(cleaned)) return false; // Todos iguais
  
  // ✅ Algoritmo real de validação de CNPJ
  let soma = 0;
  let pos = 5;
  
  for (let i = 0; i < 12; i++) {
    soma += parseInt(cleaned.charAt(i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== parseInt(cleaned.charAt(12))) return false;
  
  soma = 0;
  pos = 6;
  
  for (let i = 0; i < 13; i++) {
    soma += parseInt(cleaned.charAt(i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  return resultado === parseInt(cleaned.charAt(13));
};