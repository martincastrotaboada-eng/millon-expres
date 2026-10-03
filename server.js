const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// Configuración Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Configuración Mercado Pago
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const preference = new Preference(client);

// 1. Obtener estado de los 10.000 números
app.get('/api/numeros', async (req, res) => {
  const { data, error } = await supabase.from('numeros').select('numero, estado');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 2. Crear Preferencia de Pago
app.post('/api/crear-preferencia', async (req, res) => {
  const { numero, nombre, telefono, referido } = req.body;

  try {
    // Verificar si está disponible
    const { data: numData } = await supabase
      .from('numeros')
      .select('estado')
      .eq('numero', numero)
      .single();

    if (numData && numData.estado === 'comprado') {
      return res.status(400).json({ error: 'El número ya fue comprado' });
    }

    // Reservar temporalmente
    await supabase.from('numeros').upsert({
      numero,
      estado: 'reservado',
      comprador_nombre: nombre,
      comprador_telefono: telefono,
      referido
    });

    // Crear checkout en MP
    const result = await preference.create({
      body: {
        items: [
          {
            id: numero.toString(),
            title: `Sorteo Exprés del Millón - Nº ${numero}`,
            quantity: 1,
            unit_price: 1000,
            currency_id: 'ARS'
          }
        ],
        payer: {
          name: nombre,
          phone: { number: telefono }
        },
        external_reference: numero.toString(),
        back_urls: {
          success: 'https://millon-expres.onrender.com/?status=success',
          failure: 'https://millon-expres.onrender.com/?status=failure',
          pending: 'https://millon-expres.onrender.com/?status=pending'
        },
        auto_return: 'approved'
      }
    });

    res.json({ init_point: result.init_point });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar la preferencia' });
  }
});

// 3. Webhook de Mercado Pago (Confirmación automática)
app.post('/api/webhook', async (req, res) => {
  const { type, data } = req.body;

  if (type === 'payment') {
    const paymentId = data.id;
    // Confirmación y cambio de estado a 'comprado' en Supabase
    // cuando la transacción resulta aprobada.
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en el puerto ${PORT}`));