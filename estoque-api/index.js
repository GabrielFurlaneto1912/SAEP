const express = require('express');
const mysql = require('mysql2');

const app = express();

app.use(express.json());

// Conexão com o MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'estoque_db'
});

// Conectar ao banco
db.connect((erro) => {
    if (erro) {
        console.log('Erro ao conectar ao banco:', erro);
        return;
    }

    console.log('Banco conectado');
});

// Rota inicial para verificar o servidor
app.get('/', (req, res) => {
    res.json({ mensagem: 'API de estoque funcionando!' });
});

// ETAPA 6 — GET /produtos
// Listar todos os produtos
app.get('/produtos', (req, res) => {
    db.query(
        'SELECT * FROM produtos',
        (erro, resultado) => {
            if (erro) {
                return res.status(500).json({ erro: erro.message });
            }

            res.json(resultado);
        }
    );
});

// ETAPA 7 — POST /produtos
// Cadastrar um produto com validações
app.post('/produtos', (req, res) => {
    const {
        nome,
        valor,
        quantidade,
        categoria
    } = req.body;

    if (
        typeof nome !== 'string' ||
        !nome.trim() ||
        typeof categoria !== 'string' ||
        !categoria.trim() ||
        valor === undefined ||
        valor === null ||
        valor === '' ||
        !Number.isFinite(Number(valor)) ||
        quantidade === undefined ||
        quantidade === null ||
        quantidade === '' ||
        !Number.isInteger(Number(quantidade))
    ) {
        return res.status(400).json({
            erro: 'Dados inválidos ou obrigatórios ausentes'
        });
    }

    if (Number(valor) <= 0) {
        return res.status(400).json({
            erro: 'Valor inválido'
        });
    }

    if (Number(quantidade) < 0) {
        return res.status(400).json({
            erro: 'Quantidade inválida'
        });
    }

    if (!categoria.trim()) {
        return res.status(400).json({
            erro: 'Categoria obrigatória'
        });
    }

    const sql = `
        INSERT INTO produtos
            (nome, valor, quantidade, categoria)
        VALUES (?, ?, ?, ?)
    `;

    const dados = [
        nome.trim(),
        Number(valor),
        Number(quantidade),
        categoria.trim()
    ];

    db.query(sql, dados, (erro, resultado) => {
        if (erro) {
            return res.status(500).json({
                erro: erro.message
            });
        }

        res.status(201).json({
            mensagem: 'Produto cadastrado com sucesso',
            id: resultado.insertId
        });
    });
});

// ETAPA 8 — POST /movimentacoes/entrada
// Registrar uma entrada e aumentar o estoque
app.post('/movimentacoes/entrada', (req, res) => {
    const {
        data,
        quantidade,
        id_produto
    } = req.body;

    if (
        typeof data !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(data) ||
        !Number.isInteger(Number(quantidade)) ||
        quantidade === undefined ||
        quantidade === null ||
        quantidade === '' ||
        Number(quantidade) <= 0 ||
        !Number.isInteger(Number(id_produto)) ||
        Number(id_produto) <= 0
    ) {
        return res.status(400).json({
            erro: 'Data, quantidade ou produto inválido'
        });
    }

    // Verificar se o produto existe
    db.query(
        'SELECT id FROM produtos WHERE id = ?',
        [Number(id_produto)],
        (erro, produtos) => {
            if (erro) {
                return res.status(500).json({
                    erro: erro.message
                });
            }

            if (produtos.length === 0) {
                return res.status(404).json({
                    erro: 'Produto não encontrado'
                });
            }

            // Registrar a movimentação
            const sql = `
                INSERT INTO movimentacoes
                    (data, tipo, quantidade, id_produto)
                VALUES (?, 'entrada', ?, ?)
            `;

            db.query(
                sql,
                [data, Number(quantidade), Number(id_produto)],
                (erro, resultado) => {
                    if (erro) {
                        return res.status(500).json({
                            erro: erro.message
                        });
                    }

                    // Atualizar a quantidade do produto
                    db.query(
                        `UPDATE produtos
                         SET quantidade = quantidade + ?
                         WHERE id = ?`,
                        [Number(quantidade), Number(id_produto)],
                        (erro) => {
                            if (erro) {
                                return res.status(500).json({
                                    erro: 'Movimentação registrada, mas falhou a atualização do estoque',
                                    detalhe: erro.message,
                                    id_movimentacao: resultado.insertId
                                });
                            }

                            res.status(201).json({
                                mensagem: 'Entrada registrada com sucesso',
                                id_movimentacao: resultado.insertId
                            });
                        }
                    );
                }
            );
        }
    );
});

// ETAPA 9 — GET /categorias/valor-total
// Calcular o valor total do estoque por categoria
app.get('/categorias/valor-total', (req, res) => {
    const sql = `
        SELECT
            categoria,
            SUM(quantidade * valor) AS valor_total
        FROM produtos
        GROUP BY categoria
    `;

    db.query(sql, (erro, resultado) => {
        if (erro) {
            return res.status(500).json({
                erro: erro.message
            });
        }

        res.json(resultado);
    });
});

// ETAPA 10 — GET /movimentacoes/saidas
// Listar saídas da mais recente para a mais antiga
app.get('/movimentacoes/saidas', (req, res) => {
    const sql = `
        SELECT *
        FROM movimentacoes
        WHERE tipo = 'saida'
        ORDER BY data DESC
    `;

    db.query(sql, (erro, resultado) => {
        if (erro) {
            return res.status(500).json({
                erro: erro.message
            });
        }

        res.json(resultado);
    });
});

// ETAPA 11 — GET /produtos/limites
// Classificar os níveis do estoque
app.get('/produtos/limites', (req, res) => {
    const sql = `
        SELECT
            nome,
            quantidade,
            CASE
                WHEN quantidade = 0 THEN 'mínimo'
                WHEN quantidade >= 100 THEN 'máximo'
                ELSE 'normal'
            END AS nivel,
            ROUND((quantidade / 100) * 100, 2) AS percentual
        FROM produtos
    `;

    db.query(sql, (erro, resultado) => {
        if (erro) {
            return res.status(500).json({
                erro: erro.message
            });
        }

        res.json(resultado);
    });
});

// ETAPA 12 — GET /movimentacoes/periodo
// Consultar entradas, saídas e valores em um período
app.get('/movimentacoes/periodo', (req, res) => {
    const {
        dataInicial,
        dataFinal
    } = req.query;

    if (
        typeof dataInicial !== 'string' ||
        typeof dataFinal !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dataInicial) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dataFinal) ||
        dataInicial > dataFinal
    ) {
        return res.status(400).json({
            erro: 'Informe dataInicial e dataFinal válidas, no formato AAAA-MM-DD'
        });
    }

    const sql = `
        SELECT
            p.nome,
            'unidade' AS unidade_medida,

            SUM(
                CASE
                    WHEN m.tipo = 'entrada' THEN m.quantidade
                    ELSE 0
                END
            ) AS total_entradas,

            SUM(
                CASE
                    WHEN m.tipo = 'saida' THEN m.quantidade
                    ELSE 0
                END
            ) AS total_saidas,

            SUM(
                CASE
                    WHEN m.tipo = 'entrada' THEN m.quantidade
                    ELSE -m.quantidade
                END
            ) AS saldo_periodo,

            SUM(
                CASE
                    WHEN m.tipo = 'entrada'
                    THEN m.quantidade * p.valor
                    ELSE 0
                END
            ) AS valor_total_entradas,

            SUM(
                CASE
                    WHEN m.tipo = 'saida'
                    THEN m.quantidade * p.valor
                    ELSE 0
                END
            ) AS valor_total_saidas

        FROM movimentacoes m
        JOIN produtos p
            ON m.id_produto = p.id

        WHERE m.data BETWEEN ? AND ?

        GROUP BY p.nome
    `;

    db.query(
        sql,
        [dataInicial, dataFinal],
        (erro, resultado) => {
            if (erro) {
                return res.status(500).json({
                    erro: erro.message
                });
            }

            res.json(resultado);
        }
    );
});

// ETAPA 13 — GET /movimentacoes/maior-saida
// Classificar os produtos pelo volume de saída
app.get('/movimentacoes/maior-saida', (req, res) => {
    const {
        dataInicial,
        dataFinal
    } = req.query;

    if (
        typeof dataInicial !== 'string' ||
        typeof dataFinal !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dataInicial) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dataFinal) ||
        dataInicial > dataFinal
    ) {
        return res.status(400).json({
            erro: 'Informe dataInicial e dataFinal válidas, no formato AAAA-MM-DD'
        });
    }

    const sql = `
        SELECT
            p.nome,
            SUM(m.quantidade) AS quantidade_total_saida,
            SUM(m.quantidade * p.valor) AS valor_total_financeiro

        FROM movimentacoes m
        JOIN produtos p
            ON m.id_produto = p.id

        WHERE m.tipo = 'saida'
            AND m.data BETWEEN ? AND ?

        GROUP BY p.nome

        ORDER BY quantidade_total_saida DESC
    `;

    db.query(
        sql,
        [dataInicial, dataFinal],
        (erro, resultado) => {
            if (erro) {
                return res.status(500).json({
                    erro: erro.message
                });
            }

            res.json(resultado);
        }
    );
});

// Iniciar o servidor
app.listen(3000, () => {
    console.log('Servidor rodando em http://localhost:3000');
});