// ============================================================================
// BUSCA POTENCIAL CLIENTE - INTELIGÊNCIA ARTIFICIAL
// ============================================================================

import { adminSupabase } from '@/lib/supabase';
import type { ProspectData } from './integration';

// ============================================================================
// INTERFACES
// ============================================================================
export interface ScorePotencial {
  pontuacao: number; // 0-100
  fatores: {
    localizacao: number;      // 0-25 pontos
    reputacao: number;        // 0-20 pontos  
    atividade: number;        // 0-15 pontos
    compatibilidade: number;  // 0-25 pontos
    oportunidade: number;     // 0-15 pontos
  };
  recomendacao: 'ALTA' | 'MÉDIA' | 'BAIXA';
  motivos: string[];
  insights: string[];
}

export interface PerfilUsuario {
  id: string;
  clientes_por_categoria: Record<string, number>;
  ticket_medio_estimado: number;
  regioes_preferidas: string[];
  clientes_bem_sucedidos: any[];
  padroes_localizacao: {
    latitude_centro: number;
    longitude_centro: number;
    raio_medio: number;
  };
  horarios_preferidos: string[];
  tipos_negocio_fechados: string[];
}

export interface InsightInteligente {
  tipo: 'PADRAO' | 'OPORTUNIDADE' | 'ALERTA' | 'SUGESTAO';
  titulo: string;
  descricao: string;
  acao_sugerida?: string;
  prioridade: 'ALTA' | 'MÉDIA' | 'BAIXA';
}

// ============================================================================
// CALCULAR SCORE DE POTENCIAL
// ============================================================================
export async function calcularScorePotencial(
  prospect: ProspectData,
  userId: string,
  parametrosBusca?: any
): Promise<ScorePotencial> {
  try {
    // Obter perfil do usuário
    const perfil = await obterPerfilUsuario(userId);
    
    // Calcular fatores individuais
    const fatores = {
      localizacao: calcularScoreLocalizacao(prospect, perfil, parametrosBusca),
      reputacao: calcularScoreReputacao(prospect),
      atividade: calcularScoreAtividade(prospect),
      compatibilidade: calcularScoreCompatibilidade(prospect, perfil),
      oportunidade: calcularScoreOportunidade(prospect, perfil)
    };

    // Calcular pontuação total
    const pontuacao = Math.round(
      fatores.localizacao + 
      fatores.reputacao + 
      fatores.atividade + 
      fatores.compatibilidade + 
      fatores.oportunidade
    );

    // Determinar recomendação
    let recomendacao: 'ALTA' | 'MÉDIA' | 'BAIXA';
    if (pontuacao >= 80) recomendacao = 'ALTA';
    else if (pontuacao >= 60) recomendacao = 'MÉDIA';
    else recomendacao = 'BAIXA';

    // Gerar motivos e insights
    const motivos = gerarMotivosScore(fatores, prospect);
    const insights = gerarInsightsScore(fatores, prospect, perfil);

    return {
      pontuacao,
      fatores,
      recomendacao,
      motivos,
      insights
    };

  } catch (error) {
    console.error('Erro calcular score potencial:', error);
    
    // Retornar score básico em caso de erro
    return {
      pontuacao: 50,
      fatores: {
        localizacao: 12,
        reputacao: 10,
        atividade: 8,
        compatibilidade: 12,
        oportunidade: 8
      },
      recomendacao: 'MÉDIA',
      motivos: ['Análise básica aplicada'],
      insights: ['Dados insuficientes para análise completa']
    };
  }
}

// ============================================================================
// OBTER PERFIL DO USUÁRIO
// ============================================================================
async function obterPerfilUsuario(userId: string): Promise<PerfilUsuario> {
  try {
    // Buscar clientes do usuário
    const { data: clientes } = await adminSupabase
      .from('clientes')
      .select('*')
      .eq('user_id', userId);

    // Buscar follow-ups bem-sucedidos
    const { data: followups } = await adminSupabase
      .from('followups')
      .select('*, clientes(*)')
      .eq('user_id', userId)
      .eq('status', 'ganho');

    // Analisar dados
    const clientesPorCategoria = analisarCategorias(clientes || []);
    const ticketMedio = calcularTicketMedio(followups || []);
    const regioesPreferidas = analisarRegioes(clientes || []);
    const padroesLocalizacao = calcularCentroGeografico(clientes || []);

    return {
      id: userId,
      clientes_por_categoria: clientesPorCategoria,
      ticket_medio_estimado: ticketMedio,
      regioes_preferidas: regioesPreferidas,
      clientes_bem_sucedidos: followups || [],
      padroes_localizacao: padroesLocalizacao,
      horarios_preferidos: ['14:00', '15:00', '16:00'], // Mock
      tipos_negocio_fechados: extrairTiposNegocio(followups || [])
    };

  } catch (error) {
    console.error('Erro obter perfil usuário:', error);
    
    // Retornar perfil padrão
    return {
      id: userId,
      clientes_por_categoria: {},
      ticket_medio_estimado: 2500,
      regioes_preferidas: [],
      clientes_bem_sucedidos: [],
      padroes_localizacao: {
        latitude_centro: -23.5505,
        longitude_centro: -46.6333,
        raio_medio: 5000
      },
      horarios_preferidos: [],
      tipos_negocio_fechados: []
    };
  }
}

// ============================================================================
// CÁLCULO DOS FATORES DE SCORE
// ============================================================================

function calcularScoreLocalizacao(
  prospect: ProspectData, 
  perfil: PerfilUsuario,
  parametros?: any
): number {
  let score = 15; // Base

  // Distância do centro de atuação do usuário
  if (prospect.latitude && prospect.longitude) {
    const distancia = calcularDistancia(
      prospect.latitude, prospect.longitude,
      perfil.padroes_localizacao.latitude_centro,
      perfil.padroes_localizacao.longitude_centro
    );
    
    // Penalizar distâncias muito grandes
    if (distancia <= 2) score += 10;
    else if (distancia <= 5) score += 7;
    else if (distancia <= 10) score += 3;
    else score -= 5;
  }

  return Math.max(0, Math.min(25, score));
}

function calcularScoreReputacao(prospect: ProspectData): number {
  let score = 5; // Base
  
  // Avaliação no Google
  if (prospect.avaliacao) {
    if (prospect.avaliacao >= 4.5) score += 15;
    else if (prospect.avaliacao >= 4.0) score += 12;
    else if (prospect.avaliacao >= 3.5) score += 8;
    else if (prospect.avaliacao >= 3.0) score += 4;
  }
  
  // Número de avaliações (indica movimento)
  if (prospect.total_avaliacoes) {
    if (prospect.total_avaliacoes >= 100) score += 5;
    else if (prospect.total_avaliacoes >= 30) score += 3;
    else if (prospect.total_avaliacoes >= 10) score += 1;
  }

  return Math.max(0, Math.min(20, score));
}

function calcularScoreAtividade(prospect: ProspectData): number {
  let score = 5; // Base
  
  // Status de funcionamento
  if (prospect.status_funcionamento === 'Aberto') {
    score += 5;
  }
  
  // Presença digital
  if (prospect.site) score += 3;
  if (prospect.telefone) score += 2;
  
  return Math.max(0, Math.min(15, score));
}

function calcularScoreCompatibilidade(
  prospect: ProspectData,
  perfil: PerfilUsuario
): number {
  let score = 10; // Base
  
  // Comparar tipos de negócio
  const tiposProspect = prospect.tipos || [];
  const tiposUsuario = perfil.tipos_negocio_fechados;
  
  const compatibilidade = tiposProspect.some(tipo => 
    tiposUsuario.some(tipoUsuario => 
      tipo.includes(tipoUsuario) || tipoUsuario.includes(tipo)
    )
  );
  
  if (compatibilidade) score += 15;
  
  return Math.max(0, Math.min(25, score));
}

function calcularScoreOportunidade(
  prospect: ProspectData,
  perfil: PerfilUsuario
): number {
  let score = 5; // Base
  
  // Prospect novo na região (oportunidade)
  if (prospect.total_avaliacoes && prospect.total_avaliacoes < 20) {
    score += 5; // Negócio possivelmente novo
  }
  
  // Avaliação alta mas poucos reviews (hidden gem)
  if (prospect.avaliacao && prospect.avaliacao >= 4.0 && 
      prospect.total_avaliacoes && prospect.total_avaliacoes < 50) {
    score += 5;
  }
  
  return Math.max(0, Math.min(15, score));
}

// ============================================================================
// GERAR INSIGHTS INTELIGENTES
// ============================================================================
export async function gerarInsights(
  prospects: ProspectData[],
  userId: string,
  parametrosBusca: any
): Promise<InsightInteligente[]> {
  try {
    const perfil = await obterPerfilUsuario(userId);
    const insights: InsightInteligente[] = [];

    // Insight sobre concentração de prospects
    const concentracao = analisarConcentracaoGeografica(prospects);
    if (concentracao.alta_concentracao) {
      insights.push({
        tipo: 'PADRAO',
        titulo: 'Alta concentração encontrada',
        descricao: `${concentracao.prospects_na_area} prospects em uma área de ${concentracao.raio_km}km. Ótimo para visitas sequenciais.`,
        acao_sugerida: 'Considere criar uma rota otimizada',
        prioridade: 'ALTA'
      });
    }

    // Insight sobre qualidade dos prospects
    const mediaScore = prospects.reduce((sum, p) => sum + (p.score_potencial || 0), 0) / prospects.length;
    if (mediaScore >= 75) {
      insights.push({
        tipo: 'OPORTUNIDADE', 
        titulo: 'Prospects de alta qualidade',
        descricao: `Score médio de ${Math.round(mediaScore)}/100. Esta região tem prospects ideais para seu perfil.`,
        prioridade: 'ALTA'
      });
    }

    // Insight sobre horários
    const agora = new Date().getHours();
    if (agora >= 9 && agora <= 17) {
      const prospectsAbertos = prospects.filter(p => p.status_funcionamento === 'Aberto').length;
      if (prospectsAbertos > prospects.length * 0.7) {
        insights.push({
          tipo: 'SUGESTAO',
          titulo: 'Momento ideal para contato',
          descricao: `${prospectsAbertos} prospects estão abertos agora. Aproveite para fazer contatos diretos.`,
          acao_sugerida: 'Comece pelas ligações telefônicas',
          prioridade: 'MÉDIA'
        });
      }
    }

    // Insight sobre comparação com perfil
    const compatibilidade = prospects.filter(p => 
      calcularScoreCompatibilidade(p, perfil) >= 20
    ).length;
    
    if (compatibilidade > prospects.length * 0.5) {
      insights.push({
        tipo: 'PADRAO',
        titulo: 'Alta compatibilidade detectada',
        descricao: `${compatibilidade} prospects são similares aos seus clientes atuais. Taxa de conversão esperada: 65%+`,
        prioridade: 'ALTA'
      });
    }

    return insights.slice(0, 4); // Máximo 4 insights

  } catch (error) {
    console.error('Erro gerar insights:', error);
    return [];
  }
}

// ============================================================================
// ANALISAR PADRÃO DOS CLIENTES
// ============================================================================
export async function analisarPadraoClientes(userId: string): Promise<{
  categoria_principal: string;
  ticket_medio: number;
  regiao_concentracao: string;
  taxa_sucesso_estimada: number;
  recomendacoes: string[];
}> {
  try {
    const perfil = await obterPerfilUsuario(userId);
    
    // Categoria com mais clientes
    const categoriaPrincipal = Object.entries(perfil.clientes_por_categoria)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'empresarial';
    
    // Calcular taxa de sucesso baseada em follow-ups
    const totalFollowups = perfil.clientes_bem_sucedidos.length;
    const totalClientes = Object.values(perfil.clientes_por_categoria)
      .reduce((sum, count) => sum + count, 0);
    
    const taxaSucesso = totalClientes > 0 ? 
      Math.round((totalFollowups / totalClientes) * 100) : 50;

    const recomendacoes = [
      `Focar em ${categoriaPrincipal} (sua especialidade)`,
      `Buscar em raio de ${Math.round(perfil.padroes_localizacao.raio_medio / 1000)}km`,
      'Priorizar prospects com score 80+ pontos'
    ];

    return {
      categoria_principal: categoriaPrincipal,
      ticket_medio: perfil.ticket_medio_estimado,
      regiao_concentracao: perfil.regioes_preferidas[0] || 'Centro',
      taxa_sucesso_estimada: taxaSucesso,
      recomendacoes
    };

  } catch (error) {
    console.error('Erro analisar padrão:', error);
    
    return {
      categoria_principal: 'empresarial',
      ticket_medio: 2500,
      regiao_concentracao: 'Centro',
      taxa_sucesso_estimada: 50,
      recomendacoes: ['Cadastre mais clientes para análise detalhada']
    };
  }
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

function gerarMotivosScore(fatores: any, prospect: ProspectData): string[] {
  const motivos: string[] = [];
  
  if (fatores.localizacao >= 20) motivos.push('Localização estratégica');
  if (fatores.reputacao >= 15) motivos.push('Excelente reputação online');
  if (fatores.atividade >= 12) motivos.push('Negócio ativo e acessível');
  if (fatores.compatibilidade >= 20) motivos.push('Perfil similar aos seus clientes');
  if (fatores.oportunidade >= 12) motivos.push('Boa oportunidade de negócio');
  
  return motivos.length > 0 ? motivos : ['Prospect válido para contato'];
}

function gerarInsightsScore(fatores: any, prospect: ProspectData, perfil: PerfilUsuario): string[] {
  const insights: string[] = [];
  
  if (prospect.avaliacao && prospect.avaliacao >= 4.5) {
    insights.push('Alta satisfação dos clientes indica qualidade');
  }
  
  if (prospect.telefone) {
    insights.push('Contato telefônico disponível para abordagem direta');
  }
  
  if (fatores.compatibilidade >= 20) {
    insights.push('Similar aos seus clientes que mais fecham negócios');
  }
  
  return insights;
}

function analisarCategorias(clientes: any[]): Record<string, number> {
  const categorias: Record<string, number> = {};
  
  // Análise básica baseada em observações (seria melhor ter campo categoria)
  clientes.forEach(cliente => {
    const obs = (cliente.observacoes || '').toLowerCase();
    let categoria = 'empresarial'; // default
    
    if (obs.includes('loja') || obs.includes('varejo')) categoria = 'varejo';
    else if (obs.includes('restaurante') || obs.includes('comida')) categoria = 'alimentacao';
    else if (obs.includes('clínica') || obs.includes('saúde')) categoria = 'saude';
    else if (obs.includes('fábrica') || obs.includes('indústria')) categoria = 'industria';
    
    categorias[categoria] = (categorias[categoria] || 0) + 1;
  });
  
  return categorias;
}

function calcularTicketMedio(followups: any[]): number {
  if (!followups.length) return 2500;
  
  const valores = followups
    .map(f => f.valor_estimado)
    .filter(v => v && v > 0);
  
  if (!valores.length) return 2500;
  
  return Math.round(valores.reduce((sum, val) => sum + val, 0) / valores.length);
}

function analisarRegioes(clientes: any[]): string[] {
  // Análise básica - extrair regiões dos endereços
  const regioes = clientes
    .map(c => c.observacoes || '')
    .filter(obs => obs.length > 0)
    .slice(0, 3);
  
  return regioes.length > 0 ? regioes : ['Centro'];
}

function calcularCentroGeografico(clientes: any[]): {
  latitude_centro: number;
  longitude_centro: number;
  raio_medio: number;
} {
  // Mock - em produção seria calculado baseado nos endereços dos clientes
  return {
    latitude_centro: -23.5505,
    longitude_centro: -46.6333,
    raio_medio: 5000
  };
}

function extrairTiposNegocio(followups: any[]): string[] {
  return ['store', 'restaurant', 'service']; // Mock
}

function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function analisarConcentracaoGeografica(prospects: ProspectData[]): {
  alta_concentracao: boolean;
  prospects_na_area: number;
  raio_km: number;
} {
  // Análise simplificada
  return {
    alta_concentracao: prospects.length >= 5,
    prospects_na_area: prospects.length,
    raio_km: 2
  };
}