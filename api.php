<?php
header('Content-Type: application/json');
session_start();
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

define('KENYA_COUNTIES', [
    'Mombasa','Kwale','Kilifi','Tana River','Lamu','Taita-Taveta',
    'Garissa','Wajir','Mandera','Marsabit','Isiolo','Meru',
    'Tharaka-Nithi','Embu','Kitui','Machakos','Makueni','Nyandarua',
    'Nyeri','Kirinyaga',"Murang'a",'Kiambu','Turkana','West Pokot',
    'Samburu','Trans Nzoia','Uasin Gishu','Elgeyo-Marakwet','Nandi',
    'Baringo','Laikipia','Nakuru','Narok','Kajiado','Kericho',
    'Bomet','Kakamega','Vihiga','Bungoma','Busia','Siaya',
    'Kisumu','Homa Bay','Migori','Kisii','Nyamira','Nairobi'
]);

function sendJson($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function errorJson($msg, $code = 400) {
    sendJson(['error' => $msg], $code);
}

function isAdmin() {
    return isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true;
}

function requireAdmin() {
    if (!isAdmin()) errorJson('Unauthorized admin access', 401);
}

function getVoterSessionId() {
    return session_id();
}

function isValidCounty($county) {
    return in_array($county, KENYA_COUNTIES);
}

// Get active county from settings
function getActiveCounty($pdo) {
    $stmt = $pdo->prepare("SELECT value FROM settings WHERE key_name = 'active_county'");
    $stmt->execute();
    $row = $stmt->fetch();
    return $row ? $row['value'] : 'Nairobi';
}

// Set active county (admin only)
function setActiveCounty($pdo, $county) {
    $stmt = $pdo->prepare("REPLACE INTO settings (key_name, value) VALUES ('active_county', ?)");
    $stmt->execute([$county]);
}

switch ($action) {
    case 'get_contenders':
        $stmt = $pdo->query("SELECT id, name, description, photo FROM contenders ORDER BY id");
        sendJson($stmt->fetchAll(PDO::FETCH_ASSOC));
        break;

    case 'get_counties':
        sendJson(KENYA_COUNTIES);
        break;

    case 'get_active_county':
        sendJson(['county' => getActiveCounty($pdo)]);
        break;

    case 'set_active_county':
        requireAdmin();
        $input = json_decode(file_get_contents('php://input'), true);
        $county = $input['county'] ?? '';
        if (!isValidCounty($county)) errorJson('Invalid county');
        setActiveCounty($pdo, $county);
        sendJson(['success' => true, 'county' => $county]);
        break;

    case 'get_results':
        $county = $_GET['county'] ?? 'all';
        if ($county !== 'all' && !isValidCounty($county)) errorJson('Invalid county');
        
        if ($county === 'all') {
            $totalStmt = $pdo->query("SELECT COUNT(*) as total FROM votes");
            $totalVotes = (int)$totalStmt->fetchColumn();
            $query = "SELECT c.id, c.name, c.photo, COUNT(v.id) as votes, ? as total_votes 
                      FROM contenders c LEFT JOIN votes v ON c.id = v.contender_id 
                      GROUP BY c.id ORDER BY votes DESC";
            $stmt = $pdo->prepare($query);
            $stmt->execute([$totalVotes]);
        } else {
            $totalStmt = $pdo->prepare("SELECT COUNT(*) as total FROM votes WHERE county = ?");
            $totalStmt->execute([$county]);
            $totalVotes = (int)$totalStmt->fetchColumn();
            $query = "SELECT c.id, c.name, c.photo, COUNT(v.id) as votes, ? as total_votes 
                      FROM contenders c LEFT JOIN votes v ON c.id = v.contender_id AND v.county = ?
                      GROUP BY c.id ORDER BY votes DESC";
            $stmt = $pdo->prepare($query);
            $stmt->execute([$totalVotes, $county]);
        }
        
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($results as &$row) {
            $row['percentage'] = $totalVotes > 0 ? ($row['votes'] / $totalVotes) * 100 : 0;
        }
        sendJson($results);
        break;

    case 'vote':
        if ($method !== 'POST') errorJson('Method not allowed');
        $input = json_decode(file_get_contents('php://input'), true);
        $contenderId = $input['contender_id'] ?? null;
        if (!$contenderId) errorJson('Contender ID required');
        
        $checkContender = $pdo->prepare("SELECT id FROM contenders WHERE id = ?");
        $checkContender->execute([$contenderId]);
        if (!$checkContender->fetch()) errorJson('Invalid contender');
        
        // Use the active county set by admin
        $activeCounty = getActiveCounty($pdo);
        
        $insert = $pdo->prepare("INSERT INTO votes (contender_id, voter_session, county) VALUES (?, ?, ?)");
        $insert->execute([$contenderId, getVoterSessionId(), $activeCounty]);
        sendJson(['success' => true, 'message' => 'Vote cast successfully!']);
        break;

    case 'admin_login':
        if ($method !== 'POST') errorJson('Invalid method');
        $input = json_decode(file_get_contents('php://input'), true);
        if (($input['username'] ?? '') === 'admin' && ($input['password'] ?? '') === 'admin123') {
            $_SESSION['admin_logged_in'] = true;
            session_regenerate_id(true);
            sendJson(['success' => true]);
        } else {
            errorJson('Invalid admin credentials', 401);
        }
        break;

    case 'admin_check':
        sendJson(['logged_in' => isAdmin()]);
        break;

    case 'admin_logout':
        unset($_SESSION['admin_logged_in']);
        sendJson(['success' => true]);
        break;

    case 'add_contender':
        requireAdmin();
        $input = json_decode(file_get_contents('php://input'), true);
        $name = trim($input['name'] ?? '');
        if (!$name) errorJson('Name required');
        $desc = $input['description'] ?? '';
        $photo = $input['photo'] ?? null;
        $stmt = $pdo->prepare("INSERT INTO contenders (name, description, photo) VALUES (?, ?, ?)");
        $stmt->execute([$name, $desc, $photo]);
        sendJson(['success' => true, 'id' => $pdo->lastInsertId()]);
        break;

    case 'edit_contender':
        requireAdmin();
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $input['id'] ?? 0;
        $name = trim($input['name'] ?? '');
        if (!$id || !$name) errorJson('ID and name required');
        $desc = $input['description'] ?? '';
        $sql = "UPDATE contenders SET name = ?, description = ?";
        $params = [$name, $desc];
        if (array_key_exists('photo', $input)) {
            $sql .= ", photo = ?";
            $params[] = $input['photo'] === '' ? null : $input['photo'];
        }
        $sql .= " WHERE id = ?";
        $params[] = $id;
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        sendJson(['success' => true]);
        break;

    case 'delete_contender':
        requireAdmin();
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $input['id'] ?? 0;
        if (!$id) errorJson('ID required');
        $pdo->beginTransaction();
        $delVotes = $pdo->prepare("DELETE FROM votes WHERE contender_id = ?");
        $delVotes->execute([$id]);
        $delCont = $pdo->prepare("DELETE FROM contenders WHERE id = ?");
        $delCont->execute([$id]);
        $pdo->commit();
        sendJson(['success' => true]);
        break;

    case 'reset_votes':
        requireAdmin();
        $pdo->exec("DELETE FROM votes");
        sendJson(['success' => true]);
        break;

    default:
        errorJson('Invalid API endpoint', 404);
}
?>