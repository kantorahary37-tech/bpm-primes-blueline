--
-- PostgreSQL database dump
--

-- Dumped from database version 17.9 (Debian 17.9-1.pgdg13+1)
-- Dumped by pg_dump version 17.0

-- Started on 2026-05-06 17:02:18

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 5 (class 2615 OID 16693)
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO postgres;

--
-- TOC entry 3500 (class 0 OID 0)
-- Dependencies: 5
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA public IS '';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 228 (class 1259 OID 16779)
-- Name: aerich; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.aerich (
    id integer NOT NULL,
    version character varying(255) NOT NULL,
    app character varying(100) NOT NULL,
    content jsonb NOT NULL
);


ALTER TABLE public.aerich OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 16778)
-- Name: aerich_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.aerich_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.aerich_id_seq OWNER TO postgres;

--
-- TOC entry 3502 (class 0 OID 0)
-- Dependencies: 227
-- Name: aerich_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.aerich_id_seq OWNED BY public.aerich.id;


--
-- TOC entry 222 (class 1259 OID 16726)
-- Name: bonus; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bonus (
    id integer NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    bonus_type character varying(10) NOT NULL,
    performance_score numeric(5,2),
    absences integer,
    retard integer,
    prime_mensuel_amount numeric(15,2),
    nb_jours_astreinte integer,
    taux_jour numeric(10,2),
    prime_astreinte_amount numeric(15,2),
    ca_realise numeric(15,2),
    ca_objectif numeric(15,2),
    taux_commission numeric(5,2),
    commission_amount numeric(15,2),
    total_amount numeric(15,2) NOT NULL,
    status character varying(20) DEFAULT 'Initialisé'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by_id integer NOT NULL,
    employee_id integer NOT NULL
);


ALTER TABLE public.bonus OWNER TO postgres;

--
-- TOC entry 3503 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN bonus.bonus_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.bonus.bonus_type IS 'MENSUEL: mensuel\nASTREINTE: astreinte\nCOMMISSION: commission';


--
-- TOC entry 3504 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN bonus.status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.bonus.status IS 'INITIALISE: Initialisé\nEN_ATTENTE_N1: En attente N+1\nEN_ATTENTE_DIRECTEUR: En attente Directeur\nEN_ATTENTE_DG: En attente DG\nVALIDE: Validé\nREJETE: Rejeté';


--
-- TOC entry 221 (class 1259 OID 16725)
-- Name: bonus_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.bonus_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bonus_id_seq OWNER TO postgres;

--
-- TOC entry 3505 (class 0 OID 0)
-- Dependencies: 221
-- Name: bonus_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.bonus_id_seq OWNED BY public.bonus.id;


--
-- TOC entry 220 (class 1259 OID 16711)
-- Name: employee; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employee (
    id integer NOT NULL,
    matricule character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    department character varying(21) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    manager_id integer NOT NULL
);


ALTER TABLE public.employee OWNER TO postgres;

--
-- TOC entry 3506 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN employee.department; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.employee.department IS 'CLIENTELE: Clientèle\nCOMMERCIAL_GP: Commercial GP\nCOMMERCIAL_ENTREPRISE: Commercial entreprise\nADV: ADV\nFIDELISATION: Fidélisation\nAUDITEUR_INTERNE: Auditeur interne\nDAF_CONTROLEUR: DAF Contrôleur\nDAF_CDG: DAF CDG\nCTB: CTB\nRH: RH\nACHAT: Achat\nBBS: BBS\nCOMM_MKTG: Communication & Mktg\nDO: DO\nDSI: DSI\nDT: DT\nLOGISTIQUE: Logistique\nDIR_GENERALE: Dir générale';


--
-- TOC entry 219 (class 1259 OID 16710)
-- Name: employee_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.employee_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.employee_id_seq OWNER TO postgres;

--
-- TOC entry 3507 (class 0 OID 0)
-- Dependencies: 219
-- Name: employee_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.employee_id_seq OWNED BY public.employee.id;


--
-- TOC entry 224 (class 1259 OID 16746)
-- Name: primemax; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.primemax (
    id integer NOT NULL,
    department character varying(21) NOT NULL,
    bonus_type character varying(10) NOT NULL,
    amount numeric(15,2) NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    set_by_id integer
);


ALTER TABLE public.primemax OWNER TO postgres;

--
-- TOC entry 3508 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN primemax.department; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.primemax.department IS 'CLIENTELE: Clientèle\nCOMMERCIAL_GP: Commercial GP\nCOMMERCIAL_ENTREPRISE: Commercial entreprise\nADV: ADV\nFIDELISATION: Fidélisation\nAUDITEUR_INTERNE: Auditeur interne\nDAF_CONTROLEUR: DAF Contrôleur\nDAF_CDG: DAF CDG\nCTB: CTB\nRH: RH\nACHAT: Achat\nBBS: BBS\nCOMM_MKTG: Communication & Mktg\nDO: DO\nDSI: DSI\nDT: DT\nLOGISTIQUE: Logistique\nDIR_GENERALE: Dir générale';


--
-- TOC entry 3509 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN primemax.bonus_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.primemax.bonus_type IS 'MENSUEL: mensuel\nASTREINTE: astreinte\nCOMMISSION: commission';


--
-- TOC entry 223 (class 1259 OID 16745)
-- Name: primemax_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.primemax_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.primemax_id_seq OWNER TO postgres;

--
-- TOC entry 3510 (class 0 OID 0)
-- Dependencies: 223
-- Name: primemax_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.primemax_id_seq OWNED BY public.primemax.id;


--
-- TOC entry 218 (class 1259 OID 16695)
-- Name: user; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."user" (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    poste character varying(255),
    department character varying(21),
    is_validator_n1 boolean DEFAULT false NOT NULL,
    is_directeur boolean DEFAULT false NOT NULL,
    is_drh boolean DEFAULT false NOT NULL,
    is_dg boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."user" OWNER TO postgres;

--
-- TOC entry 3511 (class 0 OID 0)
-- Dependencies: 218
-- Name: COLUMN "user".department; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."user".department IS 'CLIENTELE: Clientèle\nCOMMERCIAL_GP: Commercial GP\nCOMMERCIAL_ENTREPRISE: Commercial entreprise\nADV: ADV\nFIDELISATION: Fidélisation\nAUDITEUR_INTERNE: Auditeur interne\nDAF_CONTROLEUR: DAF Contrôleur\nDAF_CDG: DAF CDG\nCTB: CTB\nRH: RH\nACHAT: Achat\nBBS: BBS\nCOMM_MKTG: Communication & Mktg\nDO: DO\nDSI: DSI\nDT: DT\nLOGISTIQUE: Logistique\nDIR_GENERALE: Dir générale';


--
-- TOC entry 217 (class 1259 OID 16694)
-- Name: user_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_id_seq OWNER TO postgres;

--
-- TOC entry 3512 (class 0 OID 0)
-- Dependencies: 217
-- Name: user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_id_seq OWNED BY public."user".id;


--
-- TOC entry 226 (class 1259 OID 16759)
-- Name: validation; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.validation (
    id integer NOT NULL,
    step character varying(50) NOT NULL,
    action character varying(20) NOT NULL,
    note text,
    motif_rejet text,
    validated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    bonus_id integer NOT NULL,
    validator_id integer NOT NULL
);


ALTER TABLE public.validation OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 16758)
-- Name: validation_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.validation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.validation_id_seq OWNER TO postgres;

--
-- TOC entry 3513 (class 0 OID 0)
-- Dependencies: 225
-- Name: validation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.validation_id_seq OWNED BY public.validation.id;


--
-- TOC entry 3315 (class 2604 OID 16782)
-- Name: aerich id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.aerich ALTER COLUMN id SET DEFAULT nextval('public.aerich_id_seq'::regclass);


--
-- TOC entry 3307 (class 2604 OID 16729)
-- Name: bonus id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bonus ALTER COLUMN id SET DEFAULT nextval('public.bonus_id_seq'::regclass);


--
-- TOC entry 3305 (class 2604 OID 16714)
-- Name: employee id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee ALTER COLUMN id SET DEFAULT nextval('public.employee_id_seq'::regclass);


--
-- TOC entry 3311 (class 2604 OID 16749)
-- Name: primemax id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.primemax ALTER COLUMN id SET DEFAULT nextval('public.primemax_id_seq'::regclass);


--
-- TOC entry 3299 (class 2604 OID 16698)
-- Name: user id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."user" ALTER COLUMN id SET DEFAULT nextval('public.user_id_seq'::regclass);


--
-- TOC entry 3313 (class 2604 OID 16762)
-- Name: validation id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.validation ALTER COLUMN id SET DEFAULT nextval('public.validation_id_seq'::regclass);


--
-- TOC entry 3494 (class 0 OID 16779)
-- Dependencies: 228
-- Data for Name: aerich; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.aerich (id, version, app, content) FROM stdin;
1	0_20260505093938_init.py	models	{"models.User": {"app": "models", "name": "models.User", "table": "user", "indexes": [], "managed": null, "abstract": false, "pk_field": {"name": "id", "unique": true, "default": null, "indexed": true, "nullable": false, "db_column": "id", "docstring": null, "generated": true, "field_type": "IntField", "constraints": {"ge": -2147483648, "le": 2147483647}, "description": null, "python_type": "int", "db_field_types": {"": "INT"}}, "docstring": null, "fk_fields": [], "m2m_fields": [], "o2o_fields": [], "data_fields": [{"name": "email", "unique": true, "default": null, "indexed": true, "nullable": false, "db_column": "email", "docstring": null, "generated": false, "field_type": "CharField", "constraints": {"max_length": 255}, "description": null, "python_type": "str", "db_field_types": {"": "VARCHAR(255)", "oracle": "NVARCHAR2(255)"}}, {"name": "name", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "name", "docstring": null, "generated": false, "field_type": "CharField", "constraints": {"max_length": 255}, "description": null, "python_type": "str", "db_field_types": {"": "VARCHAR(255)", "oracle": "NVARCHAR2(255)"}}, {"name": "poste", "unique": false, "default": null, "indexed": false, "nullable": true, "db_column": "poste", "docstring": null, "generated": false, "field_type": "CharField", "constraints": {"max_length": 255}, "description": null, "python_type": "str", "db_field_types": {"": "VARCHAR(255)", "oracle": "NVARCHAR2(255)"}}, {"name": "department", "unique": false, "default": null, "indexed": false, "nullable": true, "db_column": "department", "docstring": null, "generated": false, "field_type": "CharEnumFieldInstance", "constraints": {"max_length": 21}, "description": "CLIENTELE: Clientèle\\nCOMMERCIAL_GP: Commercial GP\\nCOMMERCIAL_ENTREPRISE: Commercial entreprise\\nADV: ADV\\nFIDELISATION: Fidélisation\\nAUDITEUR_INTERNE: Auditeur interne\\nDAF_CONTROLEUR: DAF Contrôleur\\nDAF_CDG: DAF CDG\\nCTB: CTB\\nRH: RH\\nACHAT: Achat\\nBBS: BBS\\nCOMM_MKTG: Communication & Mktg\\nDO: DO\\nDSI: DSI\\nDT: DT\\nLOGISTIQUE: Logistique\\nDIR_GENERALE: Dir générale", "python_type": "str", "db_field_types": {"": "VARCHAR(21)", "oracle": "NVARCHAR2(21)"}}, {"name": "is_validator_n1", "unique": false, "default": false, "indexed": false, "nullable": false, "db_column": "is_validator_n1", "docstring": null, "generated": false, "field_type": "BooleanField", "constraints": {}, "description": null, "python_type": "bool", "db_field_types": {"": "BOOL", "mssql": "BIT", "oracle": "NUMBER(1)", "sqlite": "INT"}}, {"name": "is_directeur", "unique": false, "default": false, "indexed": false, "nullable": false, "db_column": "is_directeur", "docstring": null, "generated": false, "field_type": "BooleanField", "constraints": {}, "description": null, "python_type": "bool", "db_field_types": {"": "BOOL", "mssql": "BIT", "oracle": "NUMBER(1)", "sqlite": "INT"}}, {"name": "is_drh", "unique": false, "default": false, "indexed": false, "nullable": false, "db_column": "is_drh", "docstring": null, "generated": false, "field_type": "BooleanField", "constraints": {}, "description": null, "python_type": "bool", "db_field_types": {"": "BOOL", "mssql": "BIT", "oracle": "NUMBER(1)", "sqlite": "INT"}}, {"name": "is_dg", "unique": false, "default": false, "indexed": false, "nullable": false, "db_column": "is_dg", "docstring": null, "generated": false, "field_type": "BooleanField", "constraints": {}, "description": null, "python_type": "bool", "db_field_types": {"": "BOOL", "mssql": "BIT", "oracle": "NUMBER(1)", "sqlite": "INT"}}, {"name": "created_at", "unique": false, "default": null, "indexed": false, "auto_now": false, "nullable": false, "db_column": "created_at", "docstring": null, "generated": false, "field_type": "DatetimeField", "constraints": {"readOnly": true}, "description": null, "python_type": "datetime.datetime", "auto_now_add": true, "db_field_types": {"": "TIMESTAMP", "mssql": "DATETIME2", "mysql": "DATETIME(6)", "oracle": "TIMESTAMP WITH TIME ZONE", "postgres": "TIMESTAMPTZ"}}], "description": null, "unique_together": [], "backward_fk_fields": [{"name": "bonuses", "unique": false, "default": null, "indexed": false, "nullable": false, "docstring": null, "generated": false, "field_type": "BackwardFKRelation", "constraints": {}, "description": null, "python_type": "models.Bonus", "db_constraint": true}, {"name": "employees", "unique": false, "default": null, "indexed": false, "nullable": false, "docstring": null, "generated": false, "field_type": "BackwardFKRelation", "constraints": {}, "description": null, "python_type": "models.Employee", "db_constraint": true}, {"name": "primemaxs", "unique": false, "default": null, "indexed": false, "nullable": true, "docstring": null, "generated": false, "field_type": "BackwardFKRelation", "constraints": {}, "description": null, "python_type": "models.PrimeMax", "db_constraint": true}, {"name": "validations", "unique": false, "default": null, "indexed": false, "nullable": false, "docstring": null, "generated": false, "field_type": "BackwardFKRelation", "constraints": {}, "description": null, "python_type": "models.Validation", "db_constraint": true}], "backward_o2o_fields": []}, "models.Bonus": {"app": "models", "name": "models.Bonus", "table": "bonus", "indexes": [], "managed": null, "abstract": false, "pk_field": {"name": "id", "unique": true, "default": null, "indexed": true, "nullable": false, "db_column": "id", "docstring": null, "generated": true, "field_type": "IntField", "constraints": {"ge": -2147483648, "le": 2147483647}, "description": null, "python_type": "int", "db_field_types": {"": "INT"}}, "docstring": null, "fk_fields": [{"name": "employee", "unique": false, "default": null, "indexed": false, "nullable": false, "docstring": null, "generated": false, "on_delete": "CASCADE", "raw_field": "employee_id", "field_type": "ForeignKeyFieldInstance", "constraints": {}, "description": null, "python_type": "models.Employee", "db_constraint": true}, {"name": "created_by", "unique": false, "default": null, "indexed": false, "nullable": false, "docstring": null, "generated": false, "on_delete": "CASCADE", "raw_field": "created_by_id", "field_type": "ForeignKeyFieldInstance", "constraints": {}, "description": null, "python_type": "models.User", "db_constraint": true}], "m2m_fields": [], "o2o_fields": [], "data_fields": [{"name": "month", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "month", "docstring": null, "generated": false, "field_type": "IntField", "constraints": {"ge": -2147483648, "le": 2147483647}, "description": null, "python_type": "int", "db_field_types": {"": "INT"}}, {"name": "year", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "year", "docstring": null, "generated": false, "field_type": "IntField", "constraints": {"ge": -2147483648, "le": 2147483647}, "description": null, "python_type": "int", "db_field_types": {"": "INT"}}, {"name": "bonus_type", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "bonus_type", "docstring": null, "generated": false, "field_type": "CharEnumFieldInstance", "constraints": {"max_length": 10}, "description": "MENSUEL: mensuel\\nASTREINTE: astreinte\\nCOMMISSION: commission", "python_type": "str", "db_field_types": {"": "VARCHAR(10)", "oracle": "NVARCHAR2(10)"}}, {"name": "performance_score", "unique": false, "default": null, "indexed": false, "nullable": true, "db_column": "performance_score", "docstring": null, "generated": false, "field_type": "DecimalField", "constraints": {}, "description": null, "python_type": "decimal.Decimal", "db_field_types": {"": "DECIMAL(5,2)", "sqlite": "VARCHAR(40)"}}, {"name": "absences", "unique": false, "default": null, "indexed": false, "nullable": true, "db_column": "absences", "docstring": null, "generated": false, "field_type": "IntField", "constraints": {"ge": -2147483648, "le": 2147483647}, "description": null, "python_type": "int", "db_field_types": {"": "INT"}}, {"name": "retard", "unique": false, "default": null, "indexed": false, "nullable": true, "db_column": "retard", "docstring": null, "generated": false, "field_type": "IntField", "constraints": {"ge": -2147483648, "le": 2147483647}, "description": null, "python_type": "int", "db_field_types": {"": "INT"}}, {"name": "prime_mensuel_amount", "unique": false, "default": null, "indexed": false, "nullable": true, "db_column": "prime_mensuel_amount", "docstring": null, "generated": false, "field_type": "DecimalField", "constraints": {}, "description": null, "python_type": "decimal.Decimal", "db_field_types": {"": "DECIMAL(15,2)", "sqlite": "VARCHAR(40)"}}, {"name": "nb_jours_astreinte", "unique": false, "default": null, "indexed": false, "nullable": true, "db_column": "nb_jours_astreinte", "docstring": null, "generated": false, "field_type": "IntField", "constraints": {"ge": -2147483648, "le": 2147483647}, "description": null, "python_type": "int", "db_field_types": {"": "INT"}}, {"name": "taux_jour", "unique": false, "default": null, "indexed": false, "nullable": true, "db_column": "taux_jour", "docstring": null, "generated": false, "field_type": "DecimalField", "constraints": {}, "description": null, "python_type": "decimal.Decimal", "db_field_types": {"": "DECIMAL(10,2)", "sqlite": "VARCHAR(40)"}}, {"name": "prime_astreinte_amount", "unique": false, "default": null, "indexed": false, "nullable": true, "db_column": "prime_astreinte_amount", "docstring": null, "generated": false, "field_type": "DecimalField", "constraints": {}, "description": null, "python_type": "decimal.Decimal", "db_field_types": {"": "DECIMAL(15,2)", "sqlite": "VARCHAR(40)"}}, {"name": "ca_realise", "unique": false, "default": null, "indexed": false, "nullable": true, "db_column": "ca_realise", "docstring": null, "generated": false, "field_type": "DecimalField", "constraints": {}, "description": null, "python_type": "decimal.Decimal", "db_field_types": {"": "DECIMAL(15,2)", "sqlite": "VARCHAR(40)"}}, {"name": "ca_objectif", "unique": false, "default": null, "indexed": false, "nullable": true, "db_column": "ca_objectif", "docstring": null, "generated": false, "field_type": "DecimalField", "constraints": {}, "description": null, "python_type": "decimal.Decimal", "db_field_types": {"": "DECIMAL(15,2)", "sqlite": "VARCHAR(40)"}}, {"name": "taux_commission", "unique": false, "default": null, "indexed": false, "nullable": true, "db_column": "taux_commission", "docstring": null, "generated": false, "field_type": "DecimalField", "constraints": {}, "description": null, "python_type": "decimal.Decimal", "db_field_types": {"": "DECIMAL(5,2)", "sqlite": "VARCHAR(40)"}}, {"name": "commission_amount", "unique": false, "default": null, "indexed": false, "nullable": true, "db_column": "commission_amount", "docstring": null, "generated": false, "field_type": "DecimalField", "constraints": {}, "description": null, "python_type": "decimal.Decimal", "db_field_types": {"": "DECIMAL(15,2)", "sqlite": "VARCHAR(40)"}}, {"name": "total_amount", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "total_amount", "docstring": null, "generated": false, "field_type": "DecimalField", "constraints": {}, "description": null, "python_type": "decimal.Decimal", "db_field_types": {"": "DECIMAL(15,2)", "sqlite": "VARCHAR(40)"}}, {"name": "status", "unique": false, "default": "Initialisé", "indexed": false, "nullable": false, "db_column": "status", "docstring": null, "generated": false, "field_type": "CharEnumFieldInstance", "constraints": {"max_length": 20}, "description": "INITIALISE: Initialisé\\nEN_ATTENTE_N1: En attente N+1\\nEN_ATTENTE_DIRECTEUR: En attente Directeur\\nEN_ATTENTE_DG: En attente DG\\nVALIDE: Validé\\nREJETE: Rejeté", "python_type": "str", "db_field_types": {"": "VARCHAR(20)", "oracle": "NVARCHAR2(20)"}}, {"name": "created_at", "unique": false, "default": null, "indexed": false, "auto_now": false, "nullable": false, "db_column": "created_at", "docstring": null, "generated": false, "field_type": "DatetimeField", "constraints": {"readOnly": true}, "description": null, "python_type": "datetime.datetime", "auto_now_add": true, "db_field_types": {"": "TIMESTAMP", "mssql": "DATETIME2", "mysql": "DATETIME(6)", "oracle": "TIMESTAMP WITH TIME ZONE", "postgres": "TIMESTAMPTZ"}}, {"name": "updated_at", "unique": false, "default": null, "indexed": false, "auto_now": true, "nullable": false, "db_column": "updated_at", "docstring": null, "generated": false, "field_type": "DatetimeField", "constraints": {"readOnly": true}, "description": null, "python_type": "datetime.datetime", "auto_now_add": true, "db_field_types": {"": "TIMESTAMP", "mssql": "DATETIME2", "mysql": "DATETIME(6)", "oracle": "TIMESTAMP WITH TIME ZONE", "postgres": "TIMESTAMPTZ"}}, {"name": "created_by_id", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "created_by_id", "docstring": null, "generated": false, "field_type": "IntField", "constraints": {"ge": -2147483648, "le": 2147483647}, "description": null, "python_type": "int", "db_field_types": {"": "INT"}}, {"name": "employee_id", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "employee_id", "docstring": null, "generated": false, "field_type": "IntField", "constraints": {"ge": -2147483648, "le": 2147483647}, "description": null, "python_type": "int", "db_field_types": {"": "INT"}}], "description": null, "unique_together": [], "backward_fk_fields": [{"name": "validations", "unique": false, "default": null, "indexed": false, "nullable": false, "docstring": null, "generated": false, "field_type": "BackwardFKRelation", "constraints": {}, "description": null, "python_type": "models.Validation", "db_constraint": true}], "backward_o2o_fields": []}, "models.Aerich": {"app": "models", "name": "models.Aerich", "table": "aerich", "indexes": [], "managed": null, "abstract": false, "pk_field": {"name": "id", "unique": true, "default": null, "indexed": true, "nullable": false, "db_column": "id", "docstring": null, "generated": true, "field_type": "IntField", "constraints": {"ge": -2147483648, "le": 2147483647}, "description": null, "python_type": "int", "db_field_types": {"": "INT"}}, "docstring": null, "fk_fields": [], "m2m_fields": [], "o2o_fields": [], "data_fields": [{"name": "version", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "version", "docstring": null, "generated": false, "field_type": "CharField", "constraints": {"max_length": 255}, "description": null, "python_type": "str", "db_field_types": {"": "VARCHAR(255)", "oracle": "NVARCHAR2(255)"}}, {"name": "app", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "app", "docstring": null, "generated": false, "field_type": "CharField", "constraints": {"max_length": 100}, "description": null, "python_type": "str", "db_field_types": {"": "VARCHAR(100)", "oracle": "NVARCHAR2(100)"}}, {"name": "content", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "content", "docstring": null, "generated": false, "field_type": "JSONField", "constraints": {}, "description": null, "python_type": "Union[dict, list]", "db_field_types": {"": "JSON", "mssql": "NVARCHAR(MAX)", "oracle": "NCLOB", "postgres": "JSONB"}}], "description": null, "unique_together": [], "backward_fk_fields": [], "backward_o2o_fields": []}, "models.Employee": {"app": "models", "name": "models.Employee", "table": "employee", "indexes": [], "managed": null, "abstract": false, "pk_field": {"name": "id", "unique": true, "default": null, "indexed": true, "nullable": false, "db_column": "id", "docstring": null, "generated": true, "field_type": "IntField", "constraints": {"ge": -2147483648, "le": 2147483647}, "description": null, "python_type": "int", "db_field_types": {"": "INT"}}, "docstring": null, "fk_fields": [{"name": "manager", "unique": false, "default": null, "indexed": false, "nullable": false, "docstring": null, "generated": false, "on_delete": "CASCADE", "raw_field": "manager_id", "field_type": "ForeignKeyFieldInstance", "constraints": {}, "description": null, "python_type": "models.User", "db_constraint": true}], "m2m_fields": [], "o2o_fields": [], "data_fields": [{"name": "matricule", "unique": true, "default": null, "indexed": true, "nullable": false, "db_column": "matricule", "docstring": null, "generated": false, "field_type": "CharField", "constraints": {"max_length": 50}, "description": null, "python_type": "str", "db_field_types": {"": "VARCHAR(50)", "oracle": "NVARCHAR2(50)"}}, {"name": "name", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "name", "docstring": null, "generated": false, "field_type": "CharField", "constraints": {"max_length": 255}, "description": null, "python_type": "str", "db_field_types": {"": "VARCHAR(255)", "oracle": "NVARCHAR2(255)"}}, {"name": "department", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "department", "docstring": null, "generated": false, "field_type": "CharEnumFieldInstance", "constraints": {"max_length": 21}, "description": "CLIENTELE: Clientèle\\nCOMMERCIAL_GP: Commercial GP\\nCOMMERCIAL_ENTREPRISE: Commercial entreprise\\nADV: ADV\\nFIDELISATION: Fidélisation\\nAUDITEUR_INTERNE: Auditeur interne\\nDAF_CONTROLEUR: DAF Contrôleur\\nDAF_CDG: DAF CDG\\nCTB: CTB\\nRH: RH\\nACHAT: Achat\\nBBS: BBS\\nCOMM_MKTG: Communication & Mktg\\nDO: DO\\nDSI: DSI\\nDT: DT\\nLOGISTIQUE: Logistique\\nDIR_GENERALE: Dir générale", "python_type": "str", "db_field_types": {"": "VARCHAR(21)", "oracle": "NVARCHAR2(21)"}}, {"name": "created_at", "unique": false, "default": null, "indexed": false, "auto_now": false, "nullable": false, "db_column": "created_at", "docstring": null, "generated": false, "field_type": "DatetimeField", "constraints": {"readOnly": true}, "description": null, "python_type": "datetime.datetime", "auto_now_add": true, "db_field_types": {"": "TIMESTAMP", "mssql": "DATETIME2", "mysql": "DATETIME(6)", "oracle": "TIMESTAMP WITH TIME ZONE", "postgres": "TIMESTAMPTZ"}}, {"name": "manager_id", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "manager_id", "docstring": null, "generated": false, "field_type": "IntField", "constraints": {"ge": -2147483648, "le": 2147483647}, "description": null, "python_type": "int", "db_field_types": {"": "INT"}}], "description": null, "unique_together": [], "backward_fk_fields": [{"name": "bonuses", "unique": false, "default": null, "indexed": false, "nullable": false, "docstring": null, "generated": false, "field_type": "BackwardFKRelation", "constraints": {}, "description": null, "python_type": "models.Bonus", "db_constraint": true}], "backward_o2o_fields": []}, "models.PrimeMax": {"app": "models", "name": "models.PrimeMax", "table": "primemax", "indexes": [], "managed": null, "abstract": false, "pk_field": {"name": "id", "unique": true, "default": null, "indexed": true, "nullable": false, "db_column": "id", "docstring": null, "generated": true, "field_type": "IntField", "constraints": {"ge": -2147483648, "le": 2147483647}, "description": null, "python_type": "int", "db_field_types": {"": "INT"}}, "docstring": null, "fk_fields": [{"name": "set_by", "unique": false, "default": null, "indexed": false, "nullable": true, "docstring": null, "generated": false, "on_delete": "CASCADE", "raw_field": "set_by_id", "field_type": "ForeignKeyFieldInstance", "constraints": {}, "description": null, "python_type": "models.User", "db_constraint": true}], "m2m_fields": [], "o2o_fields": [], "data_fields": [{"name": "department", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "department", "docstring": null, "generated": false, "field_type": "CharEnumFieldInstance", "constraints": {"max_length": 21}, "description": "CLIENTELE: Clientèle\\nCOMMERCIAL_GP: Commercial GP\\nCOMMERCIAL_ENTREPRISE: Commercial entreprise\\nADV: ADV\\nFIDELISATION: Fidélisation\\nAUDITEUR_INTERNE: Auditeur interne\\nDAF_CONTROLEUR: DAF Contrôleur\\nDAF_CDG: DAF CDG\\nCTB: CTB\\nRH: RH\\nACHAT: Achat\\nBBS: BBS\\nCOMM_MKTG: Communication & Mktg\\nDO: DO\\nDSI: DSI\\nDT: DT\\nLOGISTIQUE: Logistique\\nDIR_GENERALE: Dir générale", "python_type": "str", "db_field_types": {"": "VARCHAR(21)", "oracle": "NVARCHAR2(21)"}}, {"name": "bonus_type", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "bonus_type", "docstring": null, "generated": false, "field_type": "CharEnumFieldInstance", "constraints": {"max_length": 10}, "description": "MENSUEL: mensuel\\nASTREINTE: astreinte\\nCOMMISSION: commission", "python_type": "str", "db_field_types": {"": "VARCHAR(10)", "oracle": "NVARCHAR2(10)"}}, {"name": "amount", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "amount", "docstring": null, "generated": false, "field_type": "DecimalField", "constraints": {}, "description": null, "python_type": "decimal.Decimal", "db_field_types": {"": "DECIMAL(15,2)", "sqlite": "VARCHAR(40)"}}, {"name": "updated_at", "unique": false, "default": null, "indexed": false, "auto_now": true, "nullable": false, "db_column": "updated_at", "docstring": null, "generated": false, "field_type": "DatetimeField", "constraints": {"readOnly": true}, "description": null, "python_type": "datetime.datetime", "auto_now_add": true, "db_field_types": {"": "TIMESTAMP", "mssql": "DATETIME2", "mysql": "DATETIME(6)", "oracle": "TIMESTAMP WITH TIME ZONE", "postgres": "TIMESTAMPTZ"}}, {"name": "set_by_id", "unique": false, "default": null, "indexed": false, "nullable": true, "db_column": "set_by_id", "docstring": null, "generated": false, "field_type": "IntField", "constraints": {"ge": -2147483648, "le": 2147483647}, "description": null, "python_type": "int", "db_field_types": {"": "INT"}}], "description": null, "unique_together": [], "backward_fk_fields": [], "backward_o2o_fields": []}, "models.Validation": {"app": "models", "name": "models.Validation", "table": "validation", "indexes": [], "managed": null, "abstract": false, "pk_field": {"name": "id", "unique": true, "default": null, "indexed": true, "nullable": false, "db_column": "id", "docstring": null, "generated": true, "field_type": "IntField", "constraints": {"ge": -2147483648, "le": 2147483647}, "description": null, "python_type": "int", "db_field_types": {"": "INT"}}, "docstring": null, "fk_fields": [{"name": "bonus", "unique": false, "default": null, "indexed": false, "nullable": false, "docstring": null, "generated": false, "on_delete": "CASCADE", "raw_field": "bonus_id", "field_type": "ForeignKeyFieldInstance", "constraints": {}, "description": null, "python_type": "models.Bonus", "db_constraint": true}, {"name": "validator", "unique": false, "default": null, "indexed": false, "nullable": false, "docstring": null, "generated": false, "on_delete": "CASCADE", "raw_field": "validator_id", "field_type": "ForeignKeyFieldInstance", "constraints": {}, "description": null, "python_type": "models.User", "db_constraint": true}], "m2m_fields": [], "o2o_fields": [], "data_fields": [{"name": "step", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "step", "docstring": null, "generated": false, "field_type": "CharField", "constraints": {"max_length": 50}, "description": null, "python_type": "str", "db_field_types": {"": "VARCHAR(50)", "oracle": "NVARCHAR2(50)"}}, {"name": "action", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "action", "docstring": null, "generated": false, "field_type": "CharField", "constraints": {"max_length": 20}, "description": null, "python_type": "str", "db_field_types": {"": "VARCHAR(20)", "oracle": "NVARCHAR2(20)"}}, {"name": "note", "unique": false, "default": null, "indexed": false, "nullable": true, "db_column": "note", "docstring": null, "generated": false, "field_type": "TextField", "constraints": {}, "description": null, "python_type": "str", "db_field_types": {"": "TEXT", "mssql": "NVARCHAR(MAX)", "mysql": "LONGTEXT", "oracle": "NCLOB"}}, {"name": "motif_rejet", "unique": false, "default": null, "indexed": false, "nullable": true, "db_column": "motif_rejet", "docstring": null, "generated": false, "field_type": "TextField", "constraints": {}, "description": null, "python_type": "str", "db_field_types": {"": "TEXT", "mssql": "NVARCHAR(MAX)", "mysql": "LONGTEXT", "oracle": "NCLOB"}}, {"name": "validated_at", "unique": false, "default": null, "indexed": false, "auto_now": false, "nullable": false, "db_column": "validated_at", "docstring": null, "generated": false, "field_type": "DatetimeField", "constraints": {"readOnly": true}, "description": null, "python_type": "datetime.datetime", "auto_now_add": true, "db_field_types": {"": "TIMESTAMP", "mssql": "DATETIME2", "mysql": "DATETIME(6)", "oracle": "TIMESTAMP WITH TIME ZONE", "postgres": "TIMESTAMPTZ"}}, {"name": "bonus_id", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "bonus_id", "docstring": null, "generated": false, "field_type": "IntField", "constraints": {"ge": -2147483648, "le": 2147483647}, "description": null, "python_type": "int", "db_field_types": {"": "INT"}}, {"name": "validator_id", "unique": false, "default": null, "indexed": false, "nullable": false, "db_column": "validator_id", "docstring": null, "generated": false, "field_type": "IntField", "constraints": {"ge": -2147483648, "le": 2147483647}, "description": null, "python_type": "int", "db_field_types": {"": "INT"}}], "description": null, "unique_together": [], "backward_fk_fields": [], "backward_o2o_fields": []}}
\.


--
-- TOC entry 3488 (class 0 OID 16726)
-- Dependencies: 222
-- Data for Name: bonus; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bonus (id, month, year, bonus_type, performance_score, absences, retard, prime_mensuel_amount, nb_jours_astreinte, taux_jour, prime_astreinte_amount, ca_realise, ca_objectif, taux_commission, commission_amount, total_amount, status, created_at, updated_at, created_by_id, employee_id) FROM stdin;
6	5	2027	mensuel	90.00	0	0	160000.00	\N	\N	\N	\N	\N	\N	\N	160000.00	Initialisé	2026-05-06 12:54:31.701892+00	2026-05-06 12:54:31.701924+00	1	2
9	5	2026	commission	\N	\N	\N	\N	\N	\N	\N	50000000.00	100000000.00	2.50	1250000.00	1250000.00	Initialisé	2026-05-06 12:56:14.741261+00	2026-05-06 12:56:14.741279+00	1	3
4	5	2026	mensuel	85.50	2	1	150000.00	\N	\N	\N	\N	\N	\N	\N	150000.00	Prime validée	2026-05-06 12:43:58.476943+00	2026-05-06 13:42:36.761365+00	1	2
8	5	2026	astreinte	\N	\N	\N	\N	5	30000.00	150000.00	\N	\N	\N	\N	150000.00	Prime rejetée	2026-05-06 12:55:15.640267+00	2026-05-06 13:51:13.532995+00	1	2
\.


--
-- TOC entry 3486 (class 0 OID 16711)
-- Dependencies: 220
-- Data for Name: employee; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employee (id, matricule, name, department, created_at, manager_id) FROM stdin;
2	0071	Kanto SI	DSI	2026-05-06 12:39:59.273831+00	1
3	1971	Alain SI	DSI	2026-05-06 12:55:50.053032+00	1
\.


--
-- TOC entry 3490 (class 0 OID 16746)
-- Dependencies: 224
-- Data for Name: primemax; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.primemax (id, department, bonus_type, amount, updated_at, set_by_id) FROM stdin;
\.


--
-- TOC entry 3484 (class 0 OID 16695)
-- Dependencies: 218
-- Data for Name: user; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."user" (id, email, name, poste, department, is_validator_n1, is_directeur, is_drh, is_dg, created_at) FROM stdin;
1	vonjy@blueline.com	Vonjy	Chef de Projet	DSI	t	f	f	f	2026-05-06 12:21:00.527486+00
2	rivo@gulfsat.mg	Rivo	DSI	DSI	f	t	f	f	2026-05-06 13:07:27.174301+00
3	dg@blueline.mg	Damien	DG	DG	f	f	f	t	2026-05-06 13:16:26.016979+00
\.


--
-- TOC entry 3492 (class 0 OID 16759)
-- Dependencies: 226
-- Data for Name: validation; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.validation (id, step, action, note, motif_rejet, validated_at, bonus_id, validator_id) FROM stdin;
7	N1	VALIDER	\N	\N	2026-05-06 13:28:41.037138+00	4	1
8	DIRECTEUR	VALIDER	\N	\N	2026-05-06 13:29:08.542753+00	4	2
9	DRH	VALIDER	\N	\N	2026-05-06 13:29:24.291524+00	4	2
11	DG	VALIDER	\N	\N	2026-05-06 13:42:36.719165+00	4	3
12	CLOSED	AUTOMATIC	Prime validée par DG	\N	2026-05-06 13:42:36.753989+00	4	3
13	DG	REJETER	\N	Score insuffisant	2026-05-06 13:51:13.523512+00	8	3
\.


--
-- TOC entry 3514 (class 0 OID 0)
-- Dependencies: 227
-- Name: aerich_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.aerich_id_seq', 1, true);


--
-- TOC entry 3515 (class 0 OID 0)
-- Dependencies: 221
-- Name: bonus_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.bonus_id_seq', 9, true);


--
-- TOC entry 3516 (class 0 OID 0)
-- Dependencies: 219
-- Name: employee_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.employee_id_seq', 3, true);


--
-- TOC entry 3517 (class 0 OID 0)
-- Dependencies: 223
-- Name: primemax_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.primemax_id_seq', 1, false);


--
-- TOC entry 3518 (class 0 OID 0)
-- Dependencies: 217
-- Name: user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_id_seq', 3, true);


--
-- TOC entry 3519 (class 0 OID 0)
-- Dependencies: 225
-- Name: validation_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.validation_id_seq', 13, true);


--
-- TOC entry 3331 (class 2606 OID 16786)
-- Name: aerich aerich_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.aerich
    ADD CONSTRAINT aerich_pkey PRIMARY KEY (id);


--
-- TOC entry 3325 (class 2606 OID 16734)
-- Name: bonus bonus_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bonus
    ADD CONSTRAINT bonus_pkey PRIMARY KEY (id);


--
-- TOC entry 3321 (class 2606 OID 16719)
-- Name: employee employee_matricule_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee
    ADD CONSTRAINT employee_matricule_key UNIQUE (matricule);


--
-- TOC entry 3323 (class 2606 OID 16717)
-- Name: employee employee_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee
    ADD CONSTRAINT employee_pkey PRIMARY KEY (id);


--
-- TOC entry 3327 (class 2606 OID 16752)
-- Name: primemax primemax_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.primemax
    ADD CONSTRAINT primemax_pkey PRIMARY KEY (id);


--
-- TOC entry 3317 (class 2606 OID 16709)
-- Name: user user_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_key UNIQUE (email);


--
-- TOC entry 3319 (class 2606 OID 16707)
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- TOC entry 3329 (class 2606 OID 16767)
-- Name: validation validation_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.validation
    ADD CONSTRAINT validation_pkey PRIMARY KEY (id);


--
-- TOC entry 3333 (class 2606 OID 16735)
-- Name: bonus bonus_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bonus
    ADD CONSTRAINT bonus_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- TOC entry 3334 (class 2606 OID 16740)
-- Name: bonus bonus_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bonus
    ADD CONSTRAINT bonus_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employee(id) ON DELETE CASCADE;


--
-- TOC entry 3332 (class 2606 OID 16720)
-- Name: employee employee_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee
    ADD CONSTRAINT employee_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- TOC entry 3335 (class 2606 OID 16753)
-- Name: primemax primemax_set_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.primemax
    ADD CONSTRAINT primemax_set_by_id_fkey FOREIGN KEY (set_by_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- TOC entry 3336 (class 2606 OID 16768)
-- Name: validation validation_bonus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.validation
    ADD CONSTRAINT validation_bonus_id_fkey FOREIGN KEY (bonus_id) REFERENCES public.bonus(id) ON DELETE CASCADE;


--
-- TOC entry 3337 (class 2606 OID 16773)
-- Name: validation validation_validator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.validation
    ADD CONSTRAINT validation_validator_id_fkey FOREIGN KEY (validator_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- TOC entry 3501 (class 0 OID 0)
-- Dependencies: 5
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


-- Completed on 2026-05-06 17:02:19

--
-- PostgreSQL database dump complete
--

