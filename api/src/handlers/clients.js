// No arquivo handlers/clients.js
async function handleClientStates(msg, bot) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userState = getUserState(chatId);

    if (!userState.state || !userState.state.startsWith('adding_client_')) {
        return false;
    }

    try {
        switch(userState.state) {
            case 'adding_client_name':
                setUserState(chatId, 'adding_client_company', { name: text });
                await bot.sendMessage(chatId, `Cliente: ${text}\n\nQual a empresa?`);
                break;
            
            case 'adding_client_company':
                setUserState(chatId, 'adding_client_phone', { 
                    ...userState.data, 
                    company: text 
                });
                await bot.sendMessage(chatId, `Empresa: ${text}\n\nQual o telefone?`);
                break;
            
            case 'adding_client_phone':
                setUserState(chatId, 'adding_client_email', { 
                    ...userState.data, 
                    phone: text 
                });
                await bot.sendMessage(chatId, `Telefone: ${text}\n\nQual o email? (ou digite 'pular' para ignorar)`);
                break;
            
            case 'adding_client_email':
                const clientData = { 
                    ...userState.data, 
                    email: text === 'pular' ? null : text
                };
                
                console.log('Tentando adicionar cliente:', clientData); // Log para debug
                
                const clientAdded = await addClient(chatId, clientData);
                
                if (clientAdded) {
                    await bot.sendMessage(chatId, `✅ Cliente ${clientData.name} cadastrado com sucesso!`);
                } else {
                    await bot.sendMessage(chatId, `❌ Erro ao cadastrar cliente. Tente novamente.`);
                }
                
                clearUserState(chatId);
                break;
        }
        return true;
    } catch (error) {
        console.error('Erro ao processar estado do cliente:', error);
        await bot.sendMessage(chatId, "❌ Ocorreu um erro ao processar sua solicitação. Tente novamente com /cliente_add");
        clearUserState(chatId);
        return false;
    }
}