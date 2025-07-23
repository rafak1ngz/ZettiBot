// ============================================================================
// BUSCA POTENCIAL CLIENTE - VALIDAÇÕES
// ============================================================================

import { z } from 'zod';

// ============================================================================
// SCHEMAS DE VALIDAÇÃO
// ============================================================================

export const LocalizacaoSchema = z.object({
  endereco: z.string().min(5, 'Endereço deve ter pelo menos 5 caracteres'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  cep: z.string().optional()
});

export const RaioSchema = z.number()
  .min(500, 'Raio mínimo é 500 metros')
  .max(50000, 'Raio máximo é 50km');

export const CategoriaSchema = z.enum([
  'varejo',
  'alimentacao', 
  'servicos',
  'industria',
  'empresarial',
  'saude',
  'educacao',
  'automotivo',
  'construcao',
  'tecnologia'
]);

export const TipoBuscaSchema = z.enum([
  'focada',
  'area',
  'mercado',
  'rapida'
]);

export const ParametrosBuscaSchema = z.object({
  tipo_busca: TipoBuscaSchema,
  localizacao: LocalizacaoSchema.optional(),
  raio: RaioSchema.optional(),
  categoria: CategoriaSchema.optional(),
  filtros: z.object({
    avaliacao_minima: z.number().min(1).max(5).optional(),
    apenas_abertos: z.boolean().optional(),
    com_telefone: z.boolean().optional(),
    com_site: z.boolean().optional()
  }).optional()
});

// ============================================================================
// FUNÇÕES DE VALIDAÇÃO
// ============================================================================

export function validarLocalizacao(texto: string): {
  valido: boolean;
  endereco?: string;
  cep?: string;
  erro?: string;
} {
  try {
    // Limpar texto
    const textoLimpo = texto.trim();
    
    if (textoLimpo.length < 5) {
      return {
        valido: false,
        erro: 'Endereço muito curto. Digite pelo menos 5 caracteres.'
      };
    }

    // Verificar se é CEP
    const cepRegex = /^\d{5}-?\d{3}$/;
    if (cepRegex.test(textoLimpo.replace(/\D/g, ''))) {
      const cepLimpo = textoLimpo.replace(/\D/g, '');
      const cepFormatado = `${cepLimpo.slice(0, 5)}-${cepLimpo.slice(5)}`;
      
      return {
        valido: true,
        cep: cepFormatado,
        endereco: textoLimpo
      };
    }

    // Validar como endereço comum
    if (textoLimpo.length > 100) {
      return {
        valido: false,
        erro: 'Endereço muito longo. Máximo 100 caracteres.'
      };
    }

    return {
      valido: true,
      endereco: textoLimpo
    };

  } catch (error) {
    return {
      valido: false,
      erro: 'Formato de endereço inválido.'
    };
  }
}

export function validarRaio(texto: string): {
  valido: boolean;
  raio?: number;
  erro?: string;
} {
  try {
    // Extrair números do texto
    const numeroTexto = texto.replace(/\D/g, '');
    
    if (!numeroTexto) {
      return {
        valido: false,
        erro: 'Digite um número válido para o raio.'
      };
    }

    const raio = parseInt(numeroTexto);

    // Validar limites
    if (raio < 500) {
      return {
        valido: false,
        erro: 'Raio mínimo é 500 metros (0.5km).'
      };
    }

    if (raio > 50000) {
      return {
        valido: false,
        erro: 'Raio máximo é 50km.'
      };
    }

    return {
      valido: true,
      raio: raio
    };

  } catch (error) {
    return {
      valido: false,
      erro: 'Número inválido para o raio.'
    };
  }
}

export function validarCategoria(categoria: string): {
  valido: boolean;
  categoria_normalizada?: string;
  erro?: string;
} {
  try {
    const categoriasValidas = {
      'varejo': ['varejo', 'loja', 'comércio', 'mercado', 'farmácia'],
      'alimentacao': ['alimentação', 'restaurante', 'bar', 'lanchonete', 'padaria'],
      'servicos': ['serviços', 'dentista', 'salão', 'advocacia', 'contabilidade'],
      'industria': ['indústria', 'fábrica', 'galpão', 'distribuidor', 'atacado'],
      'empresarial': ['empresarial', 'escritório', 'empresa', 'startup', 'coworking'],
      'saude': ['saúde', 'clínica', 'hospital', 'consultório', 'laboratório'],
      'educacao': ['educação', 'escola', 'curso', 'universidade', 'faculdade'],
      'automotivo': ['automotivo', 'oficina', 'concessionária', 'posto', 'mecânica'],
      'construcao': ['construção', 'materiais', 'engenharia', 'arquitetura'],
      'tecnologia': ['tecnologia', 'software', 'TI', 'informática', 'digital']
    };

    const categoriaLimpa = categoria.toLowerCase().trim();

    // Buscar categoria correspondente
    for (const [chave, valores] of Object.entries(categoriasValidas)) {
      if (valores.some(valor => categoriaLimpa.includes(valor))) {
        return {
          valido: true,
          categoria_normalizada: chave
        };
      }
    }

    return {
      valido: false,
      erro: 'Categoria não reconhecida. Tente: varejo, alimentação, serviços, etc.'
    };

  } catch (error) {
    return {
      valido: false,
      erro: 'Erro ao validar categoria.'
    };
  }
}

export function validarProdutoServico(texto: string): {
  valido: boolean;
  produto_limpo?: string;
  categoria_sugerida?: string;
  erro?: string;
} {
  try {
    const textoLimpo = texto.trim();

    if (textoLimpo.length < 3) {
      return {
        valido: false,
        erro: 'Descrição muito curta. Digite pelo menos 3 caracteres.'
      };
    }

    if (textoLimpo.length > 200) {
      return {
        valido: false,
        erro: 'Descrição muito longa. Máximo 200 caracteres.'
      };
    }

    // Sugerir categoria baseada em palavras-chave
    const categoria = sugerirCategoriaPorProduto(textoLimpo);

    return {
      valido: true,
      produto_limpo: textoLimpo,
      categoria_sugerida: categoria
    };

  } catch (error) {
    return {
      valido: false,
      erro: 'Erro ao validar produto/serviço.'
    };
  }
}

export function validarTicketMedio(texto: string): {
  valido: boolean;
  valor?: number;
  faixa?: string;
  erro?: string;
} {
  try {
    // Extrair números do texto
    const numeroTexto = texto.replace(/[^\d,.-]/g, '').replace(',', '.');
    
    if (!numeroTexto) {
      return {
        valido: false,
        erro: 'Digite um valor válido (ex: 1000, R$ 2.500).'
      };
    }

    const valor = parseFloat(numeroTexto);

    if (isNaN(valor) || valor <= 0) {
      return {
        valido: false,
        erro: 'Valor deve ser maior que zero.'
      };
    }

    if (valor > 1000000) {
      return {
        valido: false,
        erro: 'Valor muito alto. Máximo R$ 1.000.000.'
      };
    }

    // Definir faixa de ticket
    let faixa = '';
    if (valor < 500) faixa = 'Baixo (até R$ 500)';
    else if (valor < 2000) faixa = 'Médio (R$ 500 - R$ 2.000)';
    else if (valor < 10000) faixa = 'Alto (R$ 2.000 - R$ 10.000)';
    else faixa = 'Premium (acima de R$ 10.000)';

    return {
      valido: true,
      valor: valor,
      faixa: faixa
    };

  } catch (error) {
    return {
      valido: false,
      erro: 'Formato de valor inválido.'
    };
  }
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

function sugerirCategoriaPorProduto(produto: string): string {
  const produtoLower = produto.toLowerCase();
  
  const mapeamento = {
    'varejo': ['produto', 'mercadoria', 'venda', 'loja', 'varejo'],
    'alimentacao': ['comida', 'alimento', 'restaurante', 'delivery', 'bebida'],
    'servicos': ['serviço', 'consultoria', 'assessoria', 'atendimento'],
    'industria': ['fabricação', 'produção', 'industrial', 'manufatura'],
    'empresarial': ['gestão', 'software', 'sistema', 'empresarial', 'business'],
    'saude': ['saúde', 'médico', 'clínica', 'tratamento', 'terapia'],
    'educacao': ['curso', 'treinamento', 'educação', 'ensino', 'aula'],
    'tecnologia': ['software', 'app', 'sistema', 'digital', 'tecnologia'],
    'construcao': ['construção', 'reforma', 'obra', 'engenharia']
  };

  for (const [categoria, palavras] of Object.entries(mapeamento)) {
    if (palavras.some(palavra => produtoLower.includes(palavra))) {
      return categoria;
    }
  }

  return 'empresarial'; // default
}

export function formatarErroValidacao(campo: string, erro: string): string {
  return `❌ **Erro em ${campo}**\n\n${erro}\n\nTente novamente:`;
}

export function validarDadosCompletos(dados: any): {
  valido: boolean;
  campos_faltando?: string[];
  erro?: string;
} {
  const camposObrigatorios = ['tipo_busca'];
  const camposFaltando = [];

  for (const campo of camposObrigatorios) {
    if (!dados[campo]) {
      camposFaltando.push(campo);
    }
  }

  if (camposFaltando.length > 0) {
    return {
      valido: false,
      campos_faltando: camposFaltando,
      erro: `Campos obrigatórios: ${camposFaltando.join(', ')}`
    };
  }

  return { valido: true };
}