/* ==========================================================================
   CONFIGURAÇÃO DO SITE — L.S Cabeleireiro
   Tudo que o Leonardo pode querer mudar fica aqui: e-mail, horários,
   serviços, preços e redes sociais. Não precisa mexer nos outros arquivos.
   ========================================================================== */

window.LS_CONFIG = {
  // E-mail que recebe os agendamentos (enviado via FormSubmit.co).
  // Deixe vazio ("") para o site rodar em MODO DE TESTE (nada é enviado).
  // Obs.: no 1º agendamento o FormSubmit manda um e-mail de ativação
  // para esse endereço — é só clicar em "Activate" uma única vez.
  emailDestino: "leonardopedrosobrinho@hotmail.com",

  // WhatsApp do salão, só números com DDI+DDD (ex.: "5511999998888").
  // Se preenchido, aparece o botão "Falar no WhatsApp" na confirmação.
  whatsapp: "5511957455442",

  // Endereço do salão (aparece no rodapé e no e-mail). Opcional.
  endereco: "",

  redes: {
    instagramPessoal: "sobrinho.leonardo",
    instagramSalao: "lscabeleireiro",
    youtube: "https://www.youtube.com/results?search_query=leonardo+sobrinho+cabeleireiro",
  },

  // Funcionamento. Dias: 0=domingo, 1=segunda ... 6=sábado.
  // null = fechado. Horários no formato "HH:MM".
  // abre: primeiro horário. ultimoHorario: último horário em que a cliente
  // pode começar (opcional). fecha: até quando o Léo trabalha; o serviço
  // precisa terminar até lá. Ex.: às 18:00 cabe um serviço de até 3 horas.
  horarios: {
    0: null,
    1: null,
    2: { abre: "09:00", ultimoHorario: "18:00", fecha: "21:00" },
    3: { abre: "09:00", ultimoHorario: "18:00", fecha: "21:00" },
    4: { abre: "09:00", ultimoHorario: "18:00", fecha: "21:00" },
    5: { abre: "09:00", ultimoHorario: "18:00", fecha: "21:00" },
    6: { abre: "09:00", fecha: "17:00" },
  },
  intervaloMinutos: 30,          // de quanto em quanto tempo aparecem os horários
  diasParaFrente: 30,            // até quantos dias à frente dá para agendar
  antecedenciaMinimaHoras: 2,    // não deixa marcar "daqui a 10 minutos"
  pausas: [{ inicio: "12:00", fim: "13:00" }], // almoço etc.

  // Catálogo. "duracao" (minutos) é uma ESTIMATIVA usada para calcular
  // quais horários cabem no dia — ajuste conforme a realidade do salão.
  categorias: [
    { id: "tratamentos", nome: "Tratamentos" },
    { id: "alisamentos", nome: "Alisamentos" },
    { id: "coloracao", nome: "Coloração" },
    { id: "cortes", nome: "Cortes" },
  ],
  servicos: [
    { id: "hidratacao", cat: "tratamentos", nome: "Hidratação & Nutrição", preco: 70, duracao: 60,
      desc: "Repõe água e nutrientes, devolvendo maciez, brilho e movimento aos fios." },
    { id: "reconstrucao", cat: "tratamentos", nome: "Reconstrução", preco: 100, duracao: 75,
      desc: "Repõe a massa capilar de fios enfraquecidos por química, calor ou descoloração." },
    { id: "nano", cat: "tratamentos", nome: "Nanotecnologia Capilar", preco: 80, duracao: 75,
      desc: "Ativos de alta penetração que tratam a fibra por dentro e alinham os fios." },
    { id: "ozonio", cat: "tratamentos", nome: "Ozonioterapia", nota: "por sessão", preco: 100, duracao: 45,
      desc: "Cuidado para o couro cabeludo: equilibra oleosidade e fortalece a raiz." },
    { id: "cauterizacao", cat: "tratamentos", nome: "Cauterização", preco: 100, duracao: 90,
      desc: "Sela as cutículas e recupera fios porosos, elásticos e quebradiços." },

    { id: "prog-com", cat: "alisamentos", nome: "Progressiva", nota: "com formol", preco: 180, duracao: 180,
      desc: "Alisamento de longa duração, liso marcado e brilho intenso." },
    { id: "prog-sem", cat: "alisamentos", nome: "Progressiva", nota: "sem formol", preco: 180, duracao: 180,
      desc: "Redução de volume e frizz com fórmula livre de formol." },
    { id: "selagem", cat: "alisamentos", nome: "Selagem", nota: "com ou sem formol", preco: 150, duracao: 150,
      desc: "Alinha a fibra e controla o frizz mantendo o movimento natural." },
    { id: "botox", cat: "alisamentos", nome: "Botox Capilar", preco: 130, duracao: 120,
      desc: "Preenche a fibra, reduz o volume e deixa os fios disciplinados." },

    { id: "cor-tinta", cat: "coloracao", nome: "Coloração com sua tinta", preco: 100, duracao: 90,
      desc: "Aplicação profissional com a coloração que você trouxer." },
    { id: "mudanca-cor", cat: "coloracao", nome: "Mudança de cor", preco: 250, duracao: 240,
      desc: "Transformação completa de cor, com diagnóstico e cuidado da fibra." },

    { id: "corte-fem", cat: "cortes", nome: "Corte Feminino", preco: 60, duracao: 60,
      desc: "Corte pensado para o seu rosto, textura de fio e rotina." },
    { id: "corte-escova", cat: "cortes", nome: "Corte com Escova", preco: 100, duracao: 90,
      desc: "Corte + escova modelada para você sair pronta do salão." },
  ],
};
