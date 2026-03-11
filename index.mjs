export const handler = async (event) => {
  const { request, session } = event;
  const intentName = request.intent?.name;

  // recupera histórico da sessão
  let history = session?.attributes?.history || [];

  // 1. Abertura da Skill
  if (request.type === "LaunchRequest") {

    history = [
      {
        role: "system",
        content: "Você é um assistente de voz da Alexa. Responda de forma curta e natural."
      }
    ];

    return buildResponse(
      "GPT ativo. O que você quer saber?",
      true,
      history
    );
  }

  // 2. Fluxo da Conversa (ChatGPT)
  if (request.type === "IntentRequest" && intentName === "ChatGPTIntent") {

    const userQuery = request.intent.slots?.query?.value;

    const stopWords = ["parar", "cancelar", "sair", "tchau", "chega"];

    if (userQuery && stopWords.includes(userQuery.toLowerCase())) {
      return buildResponse("Sessão encerrada.", false, []);
    }

    if (!userQuery) {
      return buildResponse(
        "Não consegui ouvir bem, pode repetir?",
        true,
        history
      );
    }

    try {

      // adiciona pergunta ao histórico
      history.push({
        role: "user",
        content: userQuery
      });

      const gptResponse = await callChatGPT(history);

      // adiciona resposta ao histórico
      history.push({
        role: "assistant",
        content: gptResponse
      });

      // limita histórico para evitar tokens excessivos
      history = trimHistory(history);

      return buildResponse(gptResponse, true, history);

    } catch (error) {

      console.error("Erro na API:", error);

      return buildResponse(
        "Tive um probleminha aqui. Pode tentar de novo?",
        true,
        history
      );
    }
  }

  // 3. Encerramento
  if (
    intentName === "AMAZON.StopIntent" ||
    intentName === "AMAZON.CancelIntent"
  ) {
    return buildResponse("Até mais!", false, []);
  }

  return buildResponse("Desculpe, não entendi.", true, history);
};



/*
=============================
Chamada GPT com histórico
=============================
*/

async function callChatGPT(messages) {

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
        messages: messages,
        max_tokens: 200,
        temperature: 0.7
      }),
    }
  );

  const data = await response.json();

  return (
    data.choices?.[0]?.message?.content?.trim() ||
    "Não tenho resposta para isso no momento."
  );
}



/*
=============================
Limita histórico
=============================
*/

function trimHistory(history) {

  const MAX_MESSAGES = 12;

  if (history.length > MAX_MESSAGES) {

    const system = history[0];

    const recent = history.slice(-11);

    return [system, ...recent];
  }

  return history;
}



/*
=============================
Resposta Alexa
=============================
*/

function buildResponse(text, keepOpen, history = []) {

  const response = {
    version: "1.0",

    sessionAttributes: {
      history: history
    },

    response: {
      outputSpeech: {
        type: "PlainText",
        text: text
      },
      shouldEndSession: !keepOpen
    }
  };

  if (keepOpen) {

    response.response.directives = [
      {
        type: "Dialog.ElicitSlot",
        slotToElicit: "query",
        updatedIntent: {
          name: "ChatGPTIntent",
          confirmationStatus: "NONE",
          slots: {
            query: {
              name: "query"
            }
          }
        }
      }
    ];

    response.response.reprompt = {
      outputSpeech: {
        type: "PlainText",
        text: "Ainda estou ouvindo."
      }
    };
  }

  return response;
}