if (req.method === 'POST' && path === '/api/telegram-webhook') {
    try {
        const update = req.body;
        console.log('Update recebido:', JSON.stringify(update).substring(0, 100));

        // Responder ao Telegram imediatamente para evitar timeout
        res.status(200).json({ ok: true });
        
        // Processar a mensagem de forma assíncrona
        (async () => {  // <- Adicionando função assíncrona auto-executável
            if (update && update.message) {
                // Verificar autorização
                if (supabase) {
                    try {
                        const { data, error } = await supabase
                            .from('users')
                            .select('*')
                            .eq('telegram_id', update.message.from.id)
                            .single();
                        
                        if (error || !data) {
                            await bot.sendMessage(
                                update.message.chat.id, 
                                "❌ Você não está autorizado a usar este bot. Entre em contato com o administrador."
                            );
                            return;
                        }
                    } catch (err) {
                        console.error('Erro ao verificar autorização:', err);
                    }
                }

                // Processar a mensagem
                await bot.processUpdate(update);
            }
        })().catch(error => {
            console.error('Erro ao processar mensagem:', error);
        });
    } catch (error) {
        console.error('Erro ao processar update:', error);
    }
}