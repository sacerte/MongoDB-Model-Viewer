export async function generateAIDescription(
  fieldName: string,
  type: string,
  modelName: string,
  aiContext?: string,
  aiModel?: string,
  aiApiKey?: string,
  aiBaseUrl?: string
): Promise<string> {
  try {
    const normalizedContext = (aiContext || '').trim();
    const contextText = normalizedContext || 'general de modelado de datos';
    const selectedModel = (aiModel || '').trim() || 'openai/gpt-oss-120b:free';

    if (!aiApiKey) {
      return 'Configura tu API key en Admin.';
    }

    const response = await fetch(aiBaseUrl || 'https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          {
            role: 'user',
            content: `Ayuda con una descripcion para cada campo usando este contexto: "${contextText}". Campo "${fieldName}" tipo "${type}" en una coleccion MongoDB llamada "${modelName}". Solo devuelve la descripcion, sin introducciones. Maximo 20 palabras. Sin texto extra.`
          }
        ]
      })
    });

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error con la API externa:', error);
    return 'Error al generar descripcion.';
  }
}

export async function generateAIDocumentationText(
  section: 'model_description' | 'collection_description' | 'index_description' | 'index_objective',
  payload: {
    projectName: string;
    collectionName?: string;
    indexName?: string;
    indexFields?: string[];
    indexType?: string;
    isUnique?: boolean;
    isSparse?: boolean;
  },
  aiContext?: string,
  aiModel?: string,
  aiApiKey?: string,
  aiBaseUrl?: string
): Promise<string> {
  try {
    const normalizedContext = (aiContext || '').trim();
    const contextText = normalizedContext || 'documentacion tecnica de modelos de datos MongoDB';
    const selectedModel = (aiModel || '').trim() || 'openai/gpt-oss-120b:free';

    if (!aiApiKey) {
      return 'Configura tu API key en Admin.';
    }

    const sectionPromptMap: Record<typeof section, string> = {
      model_description:
        `Redacta una descripcion profesional del modelo "${payload.projectName}". Explica alcance funcional, tipo de informacion y valor para el negocio. 80-140 palabras.`,
      collection_description:
        `Redacta una descripcion profesional de la coleccion "${payload.collectionName}" del modelo "${payload.projectName}". Explica que entidades almacena, campos esperados y uso operativo. 60-120 palabras.`,
      index_description:
        `Redacta una descripcion tecnica del indice "${payload.indexName}" en la coleccion "${payload.collectionName}". Tipo: ${payload.indexType || 'regular'}. Campos: ${(payload.indexFields || []).join(', ') || 'N/A'}. Unique: ${payload.isUnique ? 'si' : 'no'}. Sparse: ${payload.isSparse ? 'si' : 'no'}. 50-90 palabras.`,
      index_objective:
        `Redacta el objetivo tecnico y funcional del indice "${payload.indexName}" en la coleccion "${payload.collectionName}". Debe indicar rendimiento de consultas, ordenamientos o restricciones de unicidad. 35-70 palabras.`
    };

    const response = await fetch(aiBaseUrl || 'https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          {
            role: 'user',
            content: `Contexto del proyecto: "${contextText}". ${sectionPromptMap[section]} Devuelve solo el texto final, sin titulos ni bullets.`
          }
        ]
      })
    });

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error con la API externa (documentacion):', error);
    return 'Error al generar documentacion.';
  }
}


