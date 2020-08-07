import { Construct } from 'constructs';
import { App, TerraformStack } from 'cdktf';
import { 
  AlicloudProvider,
  Vpc,
  Vswitch,
  SecurityGroup,
  SecurityGroupRule,
  KeyPair,
  DataAlicloudImages,
  Instance,
  Eip,
  EipAssociation,
} from './.gen/providers/alicloud';
import { AccessKey, SecretKey, } from './key';

const resourceGroup = 'rg-...';

class MyStack extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    new AlicloudProvider(this, 'alicloud', {
      region: 'cn-hangzhou',
      accessKey: AccessKey,
      secretKey: SecretKey,
    });

    const vpc = new Vpc(this, 'test-vpc', {
      resourceGroupId: resourceGroup,
      name: 'test',
      cidrBlock: '172.16.0.0/12',
    });

    const vswitch = new Vswitch(this, 'test-vswitch', {
      vpcId: vpc.id!,
      cidrBlock: '172.16.0.0/21',
      availabilityZone: 'cn-hangzhou-h',
    });

    const securityGroup = new SecurityGroup(this, 'test-security-group', {
      resourceGroupId: resourceGroup,
      name: 'test',
      vpcId: vpc.id,
    });

    new SecurityGroupRule(this, 'test-security-group-rule', {
      type: 'ingress',
      ipProtocol: 'tcp',
      cidrIp: '0.0.0.0/0',
      portRange: '22/22',
      securityGroupId: securityGroup.id!,
    });

    const keypair = new KeyPair(this, 'test-keypair', {
      resourceGroupId: resourceGroup,
      keyName: 'test',
      publicKey: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ...',
    });

    const images = new DataAlicloudImages(this, 'test-images', {
      owners: 'self',
      nameRegex: '^debian-10$',
    });

    const instance = new Instance(this, 'test-instance', {
      resourceGroupId: resourceGroup,
      availabilityZone: 'cn-hangzhou-h',
      securityGroups: [securityGroup.id!],
      instanceType: 'ecs.t5-lc2m1.nano',
      systemDiskSize: 20,
      imageId: images.images('0').id,
      instanceName: 'test',
      vswitchId: vswitch.id,
      keyName: keypair.keyName,
    });

    const eip = new Eip(this, 'test-eip', {
      resourceGroupId: resourceGroup,
      bandwidth: 5,
      internetChargeType: 'PayByTraffic',
    });

    new EipAssociation(this, 'test-eip-association', {
      allocationId: eip.id!,
      instanceId: instance.id!,
    });

  }
}

const app = new App();
new MyStack(app, 'cdktf-alicloud-demo');
app.synth();
