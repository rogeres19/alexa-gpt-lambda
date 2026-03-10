export const handler = async (event) => {
  const { request } = event;
  const intentName = request.intent?.name;

  // 1. Abertura da Skill
  if (request.type === "LaunchRequest") {
    return buildResponse("GPT ativo. O que você quer saber?", true);
  }

  // 2. Fluxo da Conversa (ChatGPT)
  if (request.type === "IntentRequest" && intentName === "ChatGPTIntent") {
    const userQuery = request.intent.slots.query.value;

    // Se o usuário disser apenas uma palavra de parada, encerramos manualmente
    const stopWords = ["parar", "cancelar", "sair", "tchau", "chega"];

    if (userQuery && stopWords.includes(userQuery.toLowerCase())) {
      return buildResponse("Sessão encerrada.", false);
    }

    if (!userQuery) {
      return buildResponse("Não consegui ouvir bem, pode repetir?", true);
    }

    try {
      const gptResponse = await callChatGPT(userQuery);

      // O loop: responde e já prepara o microfone para a próxima pergunta
      return buildResponse(`${gptResponse}`, true);
    } catch (error) {
      console.error("Erro na API:", error);
      return buildResponse(
        "Tive um probleminha aqui. Pode tentar de novo?",
        true
      );
    }
  }

  // 3. Encerramento
  if (
    intentName === "AMAZON.StopIntent" ||
    intentName === "AMAZON.CancelIntent"
  ) {
    return buildResponse("Até mais!", false);
  }

  return buildResponse("Desculpe, não entendi.", true);
};

/**
 * Chamada nativa usando Fetch API (Padrão no Node.js moderno)
 */
async function callChatGPT(prompt) {
  const response = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Você é um assistente de voz. Seja conciso e direto.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 200,
      }),
    }
  );

  const data = await response.json();

  return (
    data.choices?.[0]?.message?.content?.trim() ||
    "Não tenho resposta para isso no momento."
  );
}

/**
 * Construtor de Resposta JSON (Alexa Standard)
 */
function buildResponse(text, keepOpen) {
  const response = {
    version: "1.0",
    response: {
      outputSpeech: {
        type: "PlainText",
        text: text,
      },
      shouldEndSession: !keepOpen,
    },
  };

  if (keepOpen) {
    // Força a Alexa a ouvir o slot "query"
    response.response.directives = [
      {
        type: "Dialog.ElicitSlot",
        slotToElicit: "query",
        updatedIntent: {
          name: "ChatGPTIntent",
          confirmationStatus: "NONE",
          slots: {
            query: {
              name: "query",
            },
          },
        },
      },
    ];

    response.response.reprompt = {
      outputSpeech: {
        type: "PlainText",
        text: "Ainda estou ouvindo.",
      },
    };
  }

  return response;
}